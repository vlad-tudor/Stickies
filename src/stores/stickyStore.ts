import { createStore, reconcile } from "solid-js/store";
import * as Y from "yjs";
import {
  attachDocPersistence,
  detachDocPersistence,
  clearDocPersistence,
  canPersistDocs,
} from "~/stores/docPersistence";
import { readBoardFromHash, clearHash } from "~/utils/urlState";
import { deleteImage } from "~/utils/imageStore";
import { newId } from "~/utils/id";
import { asTone, DEFAULT_TONE, type Tone } from "~/utils/tones";
import {
  makeBoard,
  normalizeBoard,
  normalizeStickies,
  normalizeThreads,
  deduplicateName,
  nextBoardName,
  type Board,
  type StickyNote,
  type Thread,
} from "~/domain/board";

// The domain model (types + pure rules) lives in ~/domain/board — this module is
// only the state layer over it: the reactive store, persistence, and mutations.
// Re-exported so consumers keep one import site for board data.
export {
  MIN_STICKY_WIDTH,
  MIN_STICKY_HEIGHT,
  stickyCenter,
  threadAnchor,
} from "~/domain/board";
export type { ImageRef, StickyNote, Thread, Board } from "~/domain/board";

// ── CRDT layout ──
// Board CONTENT is CRDT state: one Y.Doc per board (a board = a collab room).
//   meta      { init, bgColor }
//   stickies  id -> Y.Map of note fields  (per-FIELD last-write-wins)
//   threads   id -> plain Thread          (immutable: add/remove only)
// The solid store below is a read-only PROJECTION of the docs — every consumer
// keeps reading it reactively; every mutation writes the doc, and doc observers
// update the projection. The board LIST (names, tab order, active id) is
// local-only registry state, not shared: sharing hands over a board, not your
// workspace.
//
// Docs persist their update logs via y-indexeddb (docPersistence) so a reload
// resumes the SAME CRDT history — required for sessions to reconnect and merge.
// No provider is wired yet; the y-websocket relay client attaches to these same
// docs later without touching the mutations.

const STORAGE_KEY = "stickies-boards";
const LEGACY_KEY = "stickies-storage";
const LEGACY_BG_KEY = "whiteboard-bg";

// ── string keys, grouped ──

// Named maps inside every board doc (the CRDT side).
const DocMap = {
  Stickies: "stickies",
  Threads: "threads",
  Meta: "meta",
} as const;

// Keys inside a doc's meta map. `Init` marks a doc as seeded — hydration uses
// it to tell "empty because never seeded" from "empty because the update log
// hasn't applied yet".
const MetaKey = {
  Init: "init",
  BgColor: "bgColor",
} as const;

// Solid-store path segments (the projection side), compile-checked against the
// model types (`satisfies`) so they can't drift from the fields they name.
const StoreKey = {
  Boards: "boards",
  ActiveBoardId: "activeBoardId",
} as const satisfies Record<string, keyof BoardStore>;

const BoardKey = {
  Name: "name",
  Stickies: "stickies",
  Threads: "threads",
  BgColor: "bgColor",
} as const satisfies Record<string, keyof Board>;

const NoteKey = {
  Position: "position",
  Dimensions: "dimensions",
  Z: "z",
} as const satisfies Record<string, keyof StickyNote>;

// Yjs map-event actions (`change.action`); the union mirrors yjs's own —
// it doesn't export the type, but `satisfies` breaks if the values drift.
const YAction = {
  Add: "add",
  Update: "update",
  Delete: "delete",
} as const satisfies Record<string, "add" | "update" | "delete">;

type NoteField = keyof StickyNote;
type NoteFieldValue = StickyNote[NoteField];

// A note inside a doc: its fields as a Y.Map, so concurrent edits to DIFFERENT
// fields of one note both survive (per-field last-write-wins).
type YNote = Y.Map<NoteFieldValue>;
type MetaValue = boolean | Tone;

const stickyMapOf = (doc: Y.Doc): Y.Map<YNote> => doc.getMap(DocMap.Stickies);
const threadMapOf = (doc: Y.Doc): Y.Map<Thread> => doc.getMap(DocMap.Threads);
const metaMapOf = (doc: Y.Doc): Y.Map<MetaValue> => doc.getMap(DocMap.Meta);

// Geometry is gesture-transient: the projection owns these two fields for a
// note mid drag/resize (see dirtyGeometry), the doc gets them on commit.
const GEOMETRY_FIELDS: ReadonlySet<string> = new Set([
  NoteKey.Position,
  NoteKey.Dimensions,
]);

// The one Yjs -> plain boundary. yjs types toJSON() as any; every write into a
// YNote goes through typed helpers below, so its shape IS StickyNote.
const noteFromY = (yNote: YNote): StickyNote => yNote.toJSON() as StickyNote;

const noteToY = (note: StickyNote): YNote => {
  const yNote: YNote = new Y.Map();
  setYNoteFields(yNote, note);
  return yNote;
};

const setYNoteFields = (yNote: YNote, fields: Partial<StickyNote>): void => {
  // Object.keys forgets key types (TS limitation) — restore them here, once.
  for (const field of Object.keys(fields) as NoteField[]) {
    const value = fields[field];
    if (value !== undefined) yNote.set(field, value);
  }
};

type BoardStore = {
  boards: Board[];
  activeBoardId: string;
};

const [store, setStore] = createStore<BoardStore>({
  boards: [],
  activeBoardId: "",
});

const docs = new Map<string, Y.Doc>();

// Sticky ids with UNCOMMITTED transient geometry (mid drag/resize), per board.
// Their projection position/dimensions are ahead of the doc until
// commitStickies().
const dirtyGeometry = new Map<string, Set<string>>();

// Projection arrays are id-sorted: Y.Map has no order, so the array order of
// `stickies`/`threads` carries NO meaning (stacking is the explicit z field).
const byId = <T extends { id: string }>(left: T, right: T): number => {
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
};

// Insert-or-replace by id, keeping the id-sorted order on insert.
const upsertById = <T extends { id: string }>(
  list: readonly T[],
  item: T,
): T[] => {
  const at = list.findIndex((existing) => existing.id === item.id);
  if (at === -1) return [...list, item].sort(byId);
  return list.map((existing, index) => (index === at ? item : existing));
};

// Write a board's content into its doc (used for boards created this session
// and for first-run seeding of never-persisted docs).
const seedDoc = (doc: Y.Doc, board: Board): void => {
  doc.transact(() => {
    const meta = metaMapOf(doc);
    meta.set(MetaKey.Init, true);
    meta.set(MetaKey.BgColor, board.bgColor);
    const stickyMap = stickyMapOf(doc);
    for (const sticky of board.stickies) stickyMap.set(sticky.id, noteToY(sticky));
    const threadMap = threadMapOf(doc);
    for (const thread of board.threads) threadMap.set(thread.id, thread);
  });
};

// ── doc → projection binding ──
// GRANULAR: Yjs events map to surgical projection writes — a field edit touches
// one note's field, an add/remove touches one array entry. Never O(board) per
// mutation (a full rebuild per keystroke/press was a felt lag regression).
// The full rebuild (syncBoardFromDoc) survives only as the hydration true-up.

// Keep a mid-gesture note's transient geometry: the projection is AHEAD of the
// doc for dirty notes until commitStickies().
const overlayDirtyGeometry = (
  boardId: string,
  boardIdx: number,
  note: StickyNote,
): StickyNote => {
  if (!dirtyGeometry.get(boardId)?.has(note.id)) return note;
  const projected = store.boards[boardIdx].stickies.find(
    (sticky) => sticky.id === note.id,
  );
  if (!projected) return note;
  return { ...note, position: projected.position, dimensions: projected.dimensions };
};

const upsertStickyInProjection = (
  boardId: string,
  boardIdx: number,
  note: StickyNote,
): void => {
  const withGesture = overlayDirtyGeometry(boardId, boardIdx, note);
  const at = store.boards[boardIdx].stickies.findIndex(
    (sticky) => sticky.id === note.id,
  );
  if (at === -1) {
    setStore(StoreKey.Boards, boardIdx, BoardKey.Stickies, (existing) =>
      [...existing, withGesture].sort(byId),
    );
  } else {
    // reconcile keeps the existing object's identity — untouched fields don't re-render
    setStore(StoreKey.Boards, boardIdx, BoardKey.Stickies, at, reconcile(withGesture));
  }
};

const removeStickyFromProjection = (boardIdx: number, stickyId: string): void => {
  setStore(StoreKey.Boards, boardIdx, BoardKey.Stickies, (existing) =>
    existing.filter((sticky) => sticky.id !== stickyId),
  );
};

// A note add/remove/replace on the stickies map itself.
const applyStickyMapEvent = (
  boardId: string,
  boardIdx: number,
  stickyMap: Y.Map<YNote>,
  event: Y.YMapEvent<NoteFieldValue>,
): void => {
  event.changes.keys.forEach((change, stickyId) => {
    if (change.action === YAction.Delete) {
      removeStickyFromProjection(boardIdx, stickyId);
      return;
    }
    const yNote = stickyMap.get(stickyId);
    if (yNote) upsertStickyInProjection(boardId, boardIdx, noteFromY(yNote));
  });
};

// Field changes on ONE note's map — the per-keystroke / per-press path.
const applyNoteFieldEvent = (
  boardId: string,
  boardIdx: number,
  event: Y.YMapEvent<NoteFieldValue>,
): void => {
  // the note's id is the map's key in its parent — the event path
  const stickyId = String(event.path[0]);
  const stickyIdx = store.boards[boardIdx].stickies.findIndex(
    (sticky) => sticky.id === stickyId,
  );
  if (stickyIdx === -1) return;

  const yNote = event.target;
  const noteIsDirty = dirtyGeometry.get(boardId)?.has(stickyId) ?? false;
  const changedFields: ReadonlySet<string> = event.keysChanged;

  const patch: Partial<StickyNote> = {};
  for (const field of changedFields) {
    // projection is ahead of the doc on dirty geometry — don't snap it back
    if (noteIsDirty && GEOMETRY_FIELDS.has(field)) continue;
    // TS can't correlate a dynamic key with its value type — one localized cast
    (patch as Record<string, NoteFieldValue | undefined>)[field] =
      yNote.get(field);
  }
  setStore(StoreKey.Boards, boardIdx, BoardKey.Stickies, stickyIdx, patch);
};

// observeDeep on the stickies map delivers a mixed batch: events on the map
// itself (path []) and events on individual note maps (path [noteId]).
const applyStickyEvents = (
  boardId: string,
  events: readonly Y.YMapEvent<NoteFieldValue>[],
): void => {
  const doc = docs.get(boardId);
  const boardIdx = boardIndex(boardId);
  if (!doc || boardIdx === -1) return;
  const stickyMap = stickyMapOf(doc);

  for (const event of events) {
    if (event.path.length === 0) {
      applyStickyMapEvent(boardId, boardIdx, stickyMap, event);
    } else {
      applyNoteFieldEvent(boardId, boardIdx, event);
    }
  }
};

const applyThreadEvent = (boardId: string, event: Y.YMapEvent<Thread>): void => {
  const doc = docs.get(boardId);
  const boardIdx = boardIndex(boardId);
  if (!doc || boardIdx === -1) return;
  const threadMap = threadMapOf(doc);

  event.changes.keys.forEach((change, threadId) => {
    if (change.action === YAction.Delete) {
      setStore(StoreKey.Boards, boardIdx, BoardKey.Threads, (existing) =>
        existing.filter((thread) => thread.id !== threadId),
      );
      return;
    }
    const thread = threadMap.get(threadId);
    if (!thread) return;
    setStore(StoreKey.Boards, boardIdx, BoardKey.Threads, (existing) =>
      upsertById(existing, thread),
    );
  });
};

const applyMetaEvent = (boardId: string): void => {
  const doc = docs.get(boardId);
  const boardIdx = boardIndex(boardId);
  if (!doc || boardIdx === -1) return;
  setStore(
    StoreKey.Boards,
    boardIdx,
    BoardKey.BgColor,
    asTone(metaMapOf(doc).get(MetaKey.BgColor)),
  );
};

// One-time true-up: full rebuild of a board's projection from its doc. Used at
// the IDB hydration boundary — granular events during the stored-log apply
// can't express "this JSON-snapshot note was deleted in doc history" (no event
// fires for it), so the boundary reconciles wholesale once.
const syncBoardFromDoc = (boardId: string): void => {
  const doc = docs.get(boardId);
  const boardIdx = boardIndex(boardId);
  if (!doc || boardIdx === -1) return;
  // Not seeded yet (IDB hydration in flight): the projection still carries the
  // JSON-snapshot content — syncing now would wipe it with an empty doc.
  if (!metaMapOf(doc).get(MetaKey.Init)) return;

  const stickies: StickyNote[] = [];
  stickyMapOf(doc).forEach((yNote) => {
    stickies.push(overlayDirtyGeometry(boardId, boardIdx, noteFromY(yNote)));
  });
  stickies.sort(byId);

  const threads: Thread[] = [];
  threadMapOf(doc).forEach((thread) => {
    threads.push(thread);
  });
  threads.sort(byId);

  setStore(StoreKey.Boards, boardIdx, BoardKey.Stickies, reconcile(stickies, { key: "id" }));
  setStore(StoreKey.Boards, boardIdx, BoardKey.Threads, reconcile(threads, { key: "id" }));
  setStore(
    StoreKey.Boards,
    boardIdx,
    BoardKey.BgColor,
    asTone(metaMapOf(doc).get(MetaKey.BgColor)),
  );
};

const installDoc = (boardId: string, doc: Y.Doc): void => {
  docs.set(boardId, doc);
  stickyMapOf(doc).observeDeep((events) =>
    // yjs types the batch as YEvent[]; every node in this map-of-maps subtree
    // is a Y.Map, so the events are all YMapEvents
    applyStickyEvents(boardId, events as Y.YMapEvent<NoteFieldValue>[]),
  );
  threadMapOf(doc).observe((event) => applyThreadEvent(boardId, event));
  metaMapOf(doc).observe(() => applyMetaEvent(boardId));
};

const appendToProjection = (board: Board): void => {
  setStore(StoreKey.Boards, (existing) => [
    ...existing,
    {
      ...board,
      stickies: [...board.stickies].sort(byId),
      threads: [...board.threads].sort(byId),
    },
  ]);
};

// Bring a NEW board (created/duplicated/imported this session) into the store:
// seed its doc, attach observers + persistence, add to the projection.
const registerBoard = (board: Board, activate: boolean): void => {
  const doc = new Y.Doc();
  seedDoc(doc, board);
  installDoc(board.id, doc);
  attachDocPersistence(board.id, doc);
  appendToProjection(board);
  if (activate) setStore(StoreKey.ActiveBoardId, board.id);
};

// Bring an EXISTING board (from the JSON snapshot) back at load time. With IDB
// available, its doc hydrates from the stored update log — resuming the same
// CRDT history — and the JSON content only SEEDS docs that were never persisted
// (first run after this feature, or a wiped IDB). The projection shows the JSON
// content immediately either way; once hydrated, the doc state reconciles over
// it. Without IDB (tests), the doc is seeded from JSON synchronously, as before.
const hydrateBoard = (board: Board): void => {
  const doc = new Y.Doc();
  if (!canPersistDocs) seedDoc(doc, board);
  installDoc(board.id, doc);
  if (canPersistDocs) {
    attachDocPersistence(board.id, doc, () => {
      if (!metaMapOf(doc).get(MetaKey.Init)) seedDoc(doc, board);
      else syncBoardFromDoc(board.id);
    });
  }
  appendToProjection(board);
};

const dropBoardDoc = (boardId: string): void => {
  detachDocPersistence(boardId);
  docs.get(boardId)?.destroy();
  docs.delete(boardId);
  dirtyGeometry.delete(boardId);
};

// Run `mutate` in a transaction on the board's doc; observers update the
// projection synchronously before this returns. False if the board is gone.
const transact = (boardId: string, mutate: (doc: Y.Doc) => void): boolean => {
  const doc = docs.get(boardId);
  if (!doc || boardIndex(boardId) === -1) return false;
  doc.transact(() => mutate(doc));
  return true;
};

// ── persistence (JSON snapshot) ──
// A JSON snapshot of the projection, same format as ever (boards + active id).
// It carries the registry (names/order/active), seeds docs that IndexedDB has
// no update log for (first run, wiped IDB, tests), and keeps a human-shaped
// copy of the data. Board CONTENT truth after hydration is the docs (IDB).

let persistTimer: ReturnType<typeof setTimeout> | undefined;

const writeNow = () => {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = undefined;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      boards: store.boards,
      activeBoardId: store.activeBoardId,
    }),
  );
};

// Debounced so bursts (per-keystroke content edits, drag/resize commits) coalesce
// into ONE localStorage write instead of one per event. Flushed on page hide so the
// last change is never lost. The in-memory store updates immediately either way, so
// cross-pane live sync is unaffected.
const persist = () => {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(writeNow, 250);
};

if (typeof window !== "undefined") {
  const flush = () => {
    if (persistTimer) writeNow();
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

/**
 * Migrate from the old single-board localStorage format.
 * Returns a board if legacy data was found, otherwise null.
 */
function migrateLegacy(): Board | null {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return null;
  // JSON.parse is untyped; this cast states the legacy persisted format
  const stickies = normalizeStickies(JSON.parse(raw) as StickyNote[]);
  const bgColor = asTone(localStorage.getItem(LEGACY_BG_KEY));
  localStorage.removeItem(LEGACY_KEY);
  localStorage.removeItem(LEGACY_BG_KEY);
  return makeBoard("My Board", stickies, bgColor);
}

export function loadBoards(): void {
  // reset (tests / re-entry): drop every doc and start from persisted state
  for (const boardId of [...docs.keys()]) dropBoardDoc(boardId);
  setStore({ boards: [], activeBoardId: "" });

  // 1. load existing boards from localStorage (or migrate / bootstrap)
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    // JSON.parse is untyped; this cast states the persisted snapshot format
    const snapshot = JSON.parse(raw) as BoardStore;
    for (const board of snapshot.boards) hydrateBoard(normalizeBoard(board));
    const activeIsLive = store.boards.some(
      (board) => board.id === snapshot.activeBoardId,
    );
    setStore(
      StoreKey.ActiveBoardId,
      activeIsLive ? snapshot.activeBoardId : (store.boards[0]?.id ?? ""),
    );
  } else {
    const legacy = migrateLegacy();
    registerBoard(legacy ?? makeBoard("Board 1"), true);
  }

  // 2. if the URL contains a shared board, import it as a new tab
  const shared = readBoardFromHash();
  if (shared) {
    // auto-name with the import date (no prompt); rename via the tab if wanted
    const stamp = new Date().toLocaleDateString();
    const name = deduplicateName(
      `${shared.name} (imported ${stamp})`,
      store.boards,
    );

    const sharedStickies = normalizeStickies(shared.stickies);
    const board = makeBoard(
      name,
      sharedStickies,
      asTone(shared.bgColor),
      normalizeThreads(shared.threads, sharedStickies),
    );
    registerBoard(board, true);
    clearHash();
  }

  persist();
}

// ── board accessors ──

export const boards = () => store.boards;
export const activeBoardId = () => store.activeBoardId;

// Every mutation below addresses its board EXPLICITLY (boardId) — never "the
// active board". The active board is a UI concept (focused pane's board, tabs);
// collab mutations must name their target, since "active" doesn't exist remotely.
const boardIndex = (boardId: string): number =>
  store.boards.findIndex((board) => board.id === boardId);

// (boardId, stickyId) -> [boardIdx, stickyIdx]; stickyIdx is -1 when either is gone.
const locate = (boardId: string, stickyId: string): [number, number] => {
  const boardIdx = boardIndex(boardId);
  if (boardIdx === -1) return [-1, -1];
  const stickyIdx = store.boards[boardIdx].stickies.findIndex(
    (sticky) => sticky.id === stickyId,
  );
  return [boardIdx, stickyIdx];
};

export const activeBoard = (): Board | undefined =>
  store.boards.find((board) => board.id === store.activeBoardId);

export const stickies = (): StickyNote[] => activeBoard()?.stickies ?? [];
export const threads = (): Thread[] => activeBoard()?.threads ?? [];
export const activeBgColor = (): Tone => activeBoard()?.bgColor ?? DEFAULT_TONE;

// ── board CRUD (registry-level: list, names, order, active) ──

export function createBoard(name?: string): string {
  const finalName = name
    ? deduplicateName(name, store.boards)
    : nextBoardName(store.boards);
  const board = makeBoard(finalName);
  registerBoard(board, true);
  persist();
  return board.id;
}

// Duplicate a board into a new one ("<name> (copy)"): clones notes with FRESH ids
// (so the copy is fully independent) + threads with endpoints remapped + bg color.
// Returns the new board's id (null if the source is gone).
export function duplicateBoard(id: string): string | null {
  const source = store.boards.find((board) => board.id === id);
  if (!source) return null;

  const cloneIdByOriginal = new Map<string, string>();
  const stickies = source.stickies.map((sticky) => {
    const cloneId = newId();
    cloneIdByOriginal.set(sticky.id, cloneId);
    return { ...sticky, id: cloneId };
  });
  const threads = source.threads.map((thread) => ({
    id: newId(),
    from: cloneIdByOriginal.get(thread.from) ?? thread.from,
    to: cloneIdByOriginal.get(thread.to) ?? thread.to,
  }));

  const board = makeBoard(
    deduplicateName(`${source.name} (copy)`, store.boards),
    stickies,
    source.bgColor,
    threads,
  );
  registerBoard(board, true);
  persist();
  return board.id;
}

export function deleteBoard(id: string): void {
  const boardIdx = boardIndex(id);
  if (boardIdx === -1) return;

  for (const sticky of store.boards[boardIdx].stickies) {
    if (sticky.image) void deleteImage(sticky.image.id); // free this board's blobs
  }
  clearDocPersistence(id); // drop the stored update log with the board
  dropBoardDoc(id);
  setStore(StoreKey.Boards, (existing) => existing.filter((board) => board.id !== id));

  // if we deleted the active board, switch to a neighbour (or none if empty)
  if (store.activeBoardId === id) {
    const neighbour = store.boards[Math.min(boardIdx, store.boards.length - 1)];
    setStore(StoreKey.ActiveBoardId, neighbour ? neighbour.id : "");
  }
  persist();
}

export function renameBoard(id: string, name: string): void {
  const boardIdx = boardIndex(id);
  if (boardIdx === -1) return;
  const others = store.boards.filter((board) => board.id !== id);
  setStore(StoreKey.Boards, boardIdx, BoardKey.Name, deduplicateName(name, others));
  persist();
}

export function switchBoard(id: string): void {
  if (store.boards.some((board) => board.id === id)) {
    setStore(StoreKey.ActiveBoardId, id);
    persist();
  }
}

// Move board `fromId` to the slot of `targetId` (drag-reorder of tabs).
export function reorderBoards(fromId: string, targetId: string): void {
  const from = boardIndex(fromId);
  const to = boardIndex(targetId);
  if (from === -1 || to === -1 || from === to) return;
  const reordered = [...store.boards];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);
  setStore(StoreKey.Boards, reordered);
  persist();
}

// Move board `id` to `toIndex` in the array AFTER it's removed (0..length-1). Used by
// the tab sortable, which commits the final position once on drop.
export function reorderBoardTo(id: string, toIndex: number): void {
  const from = boardIndex(id);
  if (from === -1) return;
  const reordered = [...store.boards];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(Math.max(0, Math.min(toIndex, reordered.length)), 0, moved);
  const unchanged = reordered.every(
    (board, index) => board.id === store.boards[index].id,
  );
  if (unchanged) return;
  setStore(StoreKey.Boards, reordered);
  persist();
}

export function updateBoardBgColor(boardId: string, color: Tone): void {
  const changed = transact(boardId, (doc) =>
    metaMapOf(doc).set(MetaKey.BgColor, color),
  );
  if (changed) persist();
}

// ── thread CRUD ──

export function addThread(boardId: string, from: string, to: string): void {
  if (from === to) return;
  const boardIdx = boardIndex(boardId);
  if (boardIdx === -1) return;
  const board = store.boards[boardIdx];

  // both endpoints must live on THIS board — a connect drop can land on a note
  // in another pane's board, which isn't a link (threads are intra-board)
  const noteIds = new Set(board.stickies.map((sticky) => sticky.id));
  if (!noteIds.has(from) || !noteIds.has(to)) return;

  // skip duplicates (either direction)
  const duplicate = board.threads.some(
    (thread) =>
      (thread.from === from && thread.to === to) ||
      (thread.from === to && thread.to === from),
  );
  if (duplicate) return;

  const threadId = newId();
  const changed = transact(boardId, (doc) =>
    threadMapOf(doc).set(threadId, { id: threadId, from, to }),
  );
  if (changed) persist();
}

export function deleteThread(boardId: string, id: string): void {
  const changed = transact(boardId, (doc) => threadMapOf(doc).delete(id));
  if (changed) persist();
}

// ── sticky CRUD ──

// Set `update`'s fields on the note's Y.Map — field-level writes keep the
// per-field last-write-wins granularity.
const setNoteFieldsInDoc = (
  doc: Y.Doc,
  stickyId: string,
  update: Partial<StickyNote>,
): void => {
  const yNote = stickyMapOf(doc).get(stickyId);
  if (yNote) setYNoteFields(yNote, update);
};

// Remove a note from its doc along with every thread touching it (threads are
// intra-board; a note's links die with it).
const deleteNoteFromDoc = (doc: Y.Doc, stickyId: string): void => {
  stickyMapOf(doc).delete(stickyId);
  const threadMap = threadMapOf(doc);
  const touching: string[] = [];
  threadMap.forEach((thread, threadId) => {
    if (thread.from === stickyId || thread.to === stickyId) {
      touching.push(threadId);
    }
  });
  for (const threadId of touching) threadMap.delete(threadId);
};

// Discrete edit (color, content). Persists; does NOT reorder.
export const updateStickyNote = (
  boardId: string,
  stickyId: string,
  update: Partial<StickyNote>,
) => {
  const changed = transact(boardId, (doc) =>
    setNoteFieldsInDoc(doc, stickyId, update),
  );
  if (changed) persist();
};

// Transient high-frequency updates (drag / resize). PROJECTION-only writes — no
// doc transaction, no persist — so a drag frame costs one nested signal write.
// The note is marked geometry-dirty; commitStickies() (pointer release) writes
// the final geometry into the doc. (Once live, a throttle will also flush
// mid-drag so remote peers see the motion.)
const markGeometryDirty = (boardId: string, stickyId: string): void => {
  let dirtyIds = dirtyGeometry.get(boardId);
  if (!dirtyIds) {
    dirtyIds = new Set();
    dirtyGeometry.set(boardId, dirtyIds);
  }
  dirtyIds.add(stickyId);
};

export const moveStickyNote = (
  boardId: string,
  stickyId: string,
  position: [number, number],
) => {
  const [boardIdx, stickyIdx] = locate(boardId, stickyId);
  if (stickyIdx === -1) return;
  markGeometryDirty(boardId, stickyId);
  setStore(StoreKey.Boards, boardIdx, BoardKey.Stickies, stickyIdx, NoteKey.Position, position);
};

export const resizeStickyNote = (
  boardId: string,
  stickyId: string,
  dimensions: [number, number],
) => {
  const [boardIdx, stickyIdx] = locate(boardId, stickyId);
  if (stickyIdx === -1) return;
  markGeometryDirty(boardId, stickyId);
  setStore(StoreKey.Boards, boardIdx, BoardKey.Stickies, stickyIdx, NoteKey.Dimensions, dimensions);
};

// Flush every note's transient geometry into its board's doc (one transaction
// per board), then persist. Called once on pointer release.
export const commitStickies = () => {
  for (const [boardId, dirtyIds] of [...dirtyGeometry]) {
    const boardIdx = boardIndex(boardId);
    const pendingNotes =
      boardIdx === -1
        ? []
        : store.boards[boardIdx].stickies.filter((sticky) =>
            dirtyIds.has(sticky.id),
          );
    dirtyGeometry.delete(boardId); // clear FIRST so the sync reads the doc's values
    if (pendingNotes.length === 0) continue;
    transact(boardId, (doc) => {
      for (const note of pendingNotes) {
        setNoteFieldsInDoc(doc, note.id, {
          position: note.position,
          dimensions: note.dimensions,
        });
      }
    });
  }
  persist();
};

// One above the board's current top (z of the next note to stack on top).
const nextZ = (boardIdx: number): number => {
  const highest = store.boards[boardIdx].stickies.reduce(
    (top, sticky) => Math.max(top, sticky.z),
    -1,
  );
  return highest + 1;
};

// Raise to top of the z-order + persist. No-op if already on top.
export const raiseSticky = (boardId: string, stickyId: string) => {
  const [boardIdx, stickyIdx] = locate(boardId, stickyId);
  if (stickyIdx === -1) return;
  const topZ = nextZ(boardIdx) - 1;
  if (store.boards[boardIdx].stickies[stickyIdx].z === topZ) return;
  const changed = transact(boardId, (doc) =>
    setNoteFieldsInDoc(doc, stickyId, { z: topZ + 1 }),
  );
  if (changed) persist();
};

export const deleteStickyNote = (boardId: string, stickyId: string) => {
  const [boardIdx, stickyIdx] = locate(boardId, stickyId);
  if (stickyIdx === -1) return;
  const removed = store.boards[boardIdx].stickies[stickyIdx];
  dirtyGeometry.get(boardId)?.delete(stickyId);
  transact(boardId, (doc) => deleteNoteFromDoc(doc, stickyId));
  if (removed.image) void deleteImage(removed.image.id); // free the blob
  persist();
};

// Move a note from one board to another (cross-pane drag). Its threads in the
// source board are dropped (threads are intra-board, so a moved note arrives
// with no connections). Two docs, two transactions — in collab this is a delete
// on one room + a create on another, not one atomic op; the id travels with it.
export const moveStickyToBoard = (
  stickyId: string,
  fromBoardId: string,
  toBoardId: string,
  topLeft: { x: number; y: number }, // the note's top-left in the target board's world
) => {
  if (fromBoardId === toBoardId) return;
  const targetBoardIdx = boardIndex(toBoardId);
  const sourceBoardIdx = boardIndex(fromBoardId);
  if (targetBoardIdx === -1 || sourceBoardIdx === -1) return;
  const note = store.boards[sourceBoardIdx].stickies.find(
    (sticky) => sticky.id === stickyId,
  );
  if (!note) return;

  // arrives on top of the TARGET board's stack
  const moved: StickyNote = {
    ...note,
    position: [topLeft.y, topLeft.x],
    z: nextZ(targetBoardIdx),
  };
  dirtyGeometry.get(fromBoardId)?.delete(stickyId);
  transact(toBoardId, (doc) => stickyMapOf(doc).set(moved.id, noteToY(moved)));
  transact(fromBoardId, (doc) => deleteNoteFromDoc(doc, stickyId));
  persist();
};

export const clearAllStickies = (boardId: string) => {
  const boardIdx = boardIndex(boardId);
  if (boardIdx === -1) return;
  for (const sticky of store.boards[boardIdx].stickies) {
    if (sticky.image) void deleteImage(sticky.image.id); // free the blobs
  }
  dirtyGeometry.delete(boardId);
  transact(boardId, (doc) => {
    stickyMapOf(doc).clear();
    threadMapOf(doc).clear();
  });
  persist();
};

// New notes always land on top — z is assigned here, never by the caller.
export const createStickyNote = (
  boardId: string,
  sticky: Omit<StickyNote, "z">,
) => {
  const boardIdx = boardIndex(boardId);
  if (boardIdx === -1) return;
  const stacked: StickyNote = { ...sticky, z: nextZ(boardIdx) };
  const changed = transact(boardId, (doc) =>
    stickyMapOf(doc).set(stacked.id, noteToY(stacked)),
  );
  if (changed) persist();
};

// Duplicate a note beside itself (new id, offset down-right, top of the z-order).
// Threads are NOT copied — a duplicate has no connections.
export const duplicateStickyNote = (boardId: string, stickyId: string) => {
  const [boardIdx, stickyIdx] = locate(boardId, stickyId);
  if (stickyIdx === -1) return;
  const source = store.boards[boardIdx].stickies[stickyIdx];
  const clone: StickyNote = {
    ...source,
    id: newId(),
    position: [source.position[0] + 24, source.position[1] + 24],
    z: nextZ(boardIdx),
  };
  const changed = transact(boardId, (doc) =>
    stickyMapOf(doc).set(clone.id, noteToY(clone)),
  );
  if (changed) persist();
};
