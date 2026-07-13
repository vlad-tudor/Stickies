import { createStore, reconcile } from "solid-js/store";
import type * as Y from "yjs";
import { createDebouncedWrite } from "~/utils/debouncedWrite";
import { asTone, DEFAULT_TONE, type Tone } from "~/utils/tones";
import { deduplicateName, type Board, type StickyNote, type Thread } from "~/domain/board";
import {
  docOf,
  stickyMapOf,
  threadMapOf,
  metaMapOf,
  noteFromY,
  MetaKey,
  YAction,
  NOTE_BODY_KEY,
  type NoteFieldValue,
} from "./boardDocs";

// The solid side of the board store: a reactive PROJECTION of the board docs.
// Every consumer reads it reactively; doc observers (installDoc) keep it in
// sync with GRANULAR writes — a field edit touches one note's field, an
// add/remove touches one array entry. Never O(board) per mutation (a full
// rebuild per keystroke/press was a felt lag regression); the full rebuild
// (syncBoardFromDoc) survives only as the one-time IDB-hydration true-up.
//
// Board CONTENT flows doc -> projection. The board LIST (names, tab order,
// active id) is registry state whose source of truth IS the projection — the
// action modules write it here directly.

export type BoardStore = {
  boards: Board[];
  activeBoardId: string;
};

// Internal to the board store modules (actions write registry state and
// transient geometry through these) — the facade does not re-export them.
export const [store, setStore] = createStore<BoardStore>({
  boards: [],
  activeBoardId: "",
});

// ── string keys ──

// Solid-store path segments, compile-checked against the model types
// (`satisfies`) so they can't drift from the fields they name.
export const StoreKey = {
  Boards: "boards",
  ActiveBoardId: "activeBoardId",
} as const satisfies Record<string, keyof BoardStore>;

export const BoardKey = {
  Name: "name",
  Stickies: "stickies",
  Threads: "threads",
  BgColor: "bgColor",
} as const satisfies Record<string, keyof Board>;

export const NoteKey = {
  Position: "position",
  Dimensions: "dimensions",
  Z: "z",
} as const satisfies Record<string, keyof StickyNote>;

// Geometry is gesture-transient: the projection owns these two fields for a
// note mid drag/resize (see the dirty-geometry set), the doc gets them on commit.
const GEOMETRY_FIELDS: ReadonlySet<string> = new Set([
  NoteKey.Position,
  NoteKey.Dimensions,
]);

// ── ordering ──

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

// ── read accessors ──

export const boards = () => store.boards;
export const activeBoardId = () => store.activeBoardId;

// Every mutation addresses its board EXPLICITLY (boardId) — never "the active
// board". The active board is a UI concept (focused pane's board, tabs);
// collab mutations must name their target, since "active" doesn't exist remotely.
export const boardIndex = (boardId: string): number =>
  store.boards.findIndex((board) => board.id === boardId);

// (boardId, stickyId) -> [boardIdx, stickyIdx]; stickyIdx is -1 when either is gone.
export const locate = (boardId: string, stickyId: string): [number, number] => {
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

// ── transient geometry (dirty set) ──

// Sticky ids with UNCOMMITTED transient geometry (mid drag/resize), per board.
// Their projection position/dimensions are ahead of the doc until
// commitStickies() flushes them.
const dirtyGeometry = new Map<string, Set<string>>();

export const markGeometryDirty = (boardId: string, stickyId: string): void => {
  let dirtyIds = dirtyGeometry.get(boardId);
  if (!dirtyIds) {
    dirtyIds = new Set();
    dirtyGeometry.set(boardId, dirtyIds);
  }
  dirtyIds.add(stickyId);
};

export const unmarkGeometryDirty = (boardId: string, stickyId: string): void => {
  dirtyGeometry.get(boardId)?.delete(stickyId);
};

export const dropGeometryDirty = (boardId: string): void => {
  dirtyGeometry.delete(boardId);
};

// Snapshot of the dirty sets (commitStickies iterates this, dropping each
// board's set before flushing it into the doc).
export const geometryDirtyEntries = (): [string, ReadonlySet<string>][] => [
  ...dirtyGeometry.entries(),
];

// One board's dirty set (the live mid-drag flush reads it WITHOUT clearing —
// the gesture is still in progress).
export const geometryDirtyFor = (
  boardId: string,
): ReadonlySet<string> | undefined => dirtyGeometry.get(boardId);

const isGeometryDirty = (boardId: string, stickyId: string): boolean =>
  dirtyGeometry.get(boardId)?.has(stickyId) ?? false;

// ── doc → projection binding ──

// Keep a mid-gesture note's transient geometry: the projection is AHEAD of the
// doc for dirty notes until commitStickies().
const overlayDirtyGeometry = (
  boardId: string,
  boardIdx: number,
  note: StickyNote,
): StickyNote => {
  if (!isGeometryDirty(boardId, note.id)) return note;
  const projected = store.boards[boardIdx].stickies.find(
    (sticky) => sticky.id === note.id,
  );
  if (!projected) return note;
  return {
    ...note,
    position: projected.position,
    dimensions: projected.dimensions,
  };
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

const removeStickyFromProjection = (
  boardIdx: number,
  stickyId: string,
): void => {
  setStore(StoreKey.Boards, boardIdx, BoardKey.Stickies, (existing) =>
    existing.filter((sticky) => sticky.id !== stickyId),
  );
};

// A note add/remove/replace on the stickies map itself.
const applyStickyMapEvent = (
  boardId: string,
  boardIdx: number,
  stickyMap: ReturnType<typeof stickyMapOf>,
  event: Y.YMapEvent<NoteFieldValue>,
): void => {
  event.changes.keys.forEach((change, stickyId) => {
    if (change.action === YAction.Delete) {
      removeStickyFromProjection(boardIdx, stickyId);
      return;
    }
    const yNote = stickyMap.get(stickyId);
    if (yNote) {
      upsertStickyInProjection(boardId, boardIdx, noteFromY(yNote));
    }
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
  const noteIsDirty = isGeometryDirty(boardId, stickyId);
  const changedFields: ReadonlySet<string> = event.keysChanged;

  const patch: Partial<StickyNote> = {};
  for (const field of changedFields) {
    // the body fragment is co-editing machinery, never projection data
    if (field === NOTE_BODY_KEY) continue;
    // projection is ahead of the doc on dirty geometry — don't snap it back
    if (noteIsDirty && GEOMETRY_FIELDS.has(field)) continue;
    // TS can't correlate a dynamic key with its value type — one localized cast
    (patch as Record<string, NoteFieldValue | undefined>)[field] =
      yNote.get(field) as NoteFieldValue | undefined;
  }
  setStore(StoreKey.Boards, boardIdx, BoardKey.Stickies, stickyIdx, patch);
};

// observeDeep on the stickies map delivers a mixed batch: events on the map
// itself (path []) and events on individual note maps (path [noteId]).
const applyStickyEvents = (
  boardId: string,
  events: readonly Y.YMapEvent<NoteFieldValue>[],
): void => {
  const doc = docOf(boardId);
  const boardIdx = boardIndex(boardId);
  if (!doc || boardIdx === -1) return;
  const stickyMap = stickyMapOf(doc);

  for (const event of events) {
    if (event.path.length === 0) {
      // the stickies map itself: note add/remove/replace
      applyStickyMapEvent(boardId, boardIdx, stickyMap, event);
    } else if (event.path.length === 1) {
      // one note's field map: [noteId]
      applyNoteFieldEvent(boardId, boardIdx, event);
    }
    // deeper paths ([noteId, "body", ...]) are body-fragment traffic — the
    // editor's collaboration binding consumes those; the projection ignores them
  }
};

const applyThreadEvent = (
  boardId: string,
  event: Y.YMapEvent<Thread>,
): void => {
  const doc = docOf(boardId);
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

// Adopt the doc's replicated board name into the local registry — deduped
// against OTHER local boards (local uniqueness holds even if a remote name
// collides). Skip-if-equal keeps local renames (which write meta themselves)
// from ping-ponging.
const adoptMetaName = (boardId: string, boardIdx: number, doc: Y.Doc): void => {
  const metaName = metaMapOf(doc).get(MetaKey.Name);
  if (typeof metaName !== "string" || metaName === store.boards[boardIdx].name) {
    return;
  }
  const others = store.boards.filter((board) => board.id !== boardId);
  setStore(StoreKey.Boards, boardIdx, BoardKey.Name, deduplicateName(metaName, others));
};

const applyMetaEvent = (boardId: string): void => {
  const doc = docOf(boardId);
  const boardIdx = boardIndex(boardId);
  if (!doc || boardIdx === -1) return;
  setStore(
    StoreKey.Boards,
    boardIdx,
    BoardKey.BgColor,
    asTone(metaMapOf(doc).get(MetaKey.BgColor)),
  );
  adoptMetaName(boardId, boardIdx, doc);
};

// One-time true-up: full rebuild of a board's projection from its doc. Used at
// the IDB hydration boundary — granular events during the stored-log apply
// can't express "this JSON-snapshot note was deleted in doc history" (no event
// fires for it), so the boundary reconciles wholesale once.
export const syncBoardFromDoc = (boardId: string): void => {
  const doc = docOf(boardId);
  const boardIdx = boardIndex(boardId);
  if (!doc || boardIdx === -1) return;
  // Not seeded yet (IDB hydration in flight): the projection still carries the
  // JSON-snapshot content — syncing now would wipe it with an empty doc.
  if (!metaMapOf(doc).get(MetaKey.Init)) return;

  const nextStickies: StickyNote[] = [];
  stickyMapOf(doc).forEach((yNote) => {
    nextStickies.push(
      overlayDirtyGeometry(boardId, boardIdx, noteFromY(yNote)),
    );
  });
  nextStickies.sort(byId);

  const nextThreads: Thread[] = [];
  threadMapOf(doc).forEach((thread) => {
    nextThreads.push(thread);
  });
  nextThreads.sort(byId);

  setStore(
    StoreKey.Boards,
    boardIdx,
    BoardKey.Stickies,
    reconcile(nextStickies, { key: "id" }),
  );
  setStore(
    StoreKey.Boards,
    boardIdx,
    BoardKey.Threads,
    reconcile(nextThreads, { key: "id" }),
  );
  setStore(
    StoreKey.Boards,
    boardIdx,
    BoardKey.BgColor,
    asTone(metaMapOf(doc).get(MetaKey.BgColor)),
  );
  adoptMetaName(boardId, boardIdx, doc);
};

// Attach the doc -> projection observers to a board's doc.
export const installDoc = (boardId: string, doc: Y.Doc): void => {
  stickyMapOf(doc).observeDeep((events) =>
    // yjs types the batch as YEvent[]; every node in this map-of-maps subtree
    // is a Y.Map, so the events are all YMapEvents
    applyStickyEvents(boardId, events as Y.YMapEvent<NoteFieldValue>[]),
  );
  threadMapOf(doc).observe((event) => applyThreadEvent(boardId, event));
  metaMapOf(doc).observe(() => applyMetaEvent(boardId));
};

export const appendToProjection = (board: Board): void => {
  setStore(StoreKey.Boards, (existing) => [
    ...existing,
    {
      ...board,
      stickies: [...board.stickies].sort(byId),
      threads: [...board.threads].sort(byId),
    },
  ]);
};

// ── persistence (JSON snapshot) ──
// A JSON snapshot of the projection, same format as ever (boards + active id).
// It carries the registry (names/order/active), seeds docs that IndexedDB has
// no update log for (first run, wiped IDB, tests), and keeps a human-shaped
// copy of the data. Board CONTENT truth after hydration is the docs (IDB).

export const STORAGE_KEY = "stickies-boards";

// Debounced so bursts (per-keystroke content edits, drag/resize commits) coalesce
// into ONE localStorage write instead of one per event; flushed on page hide so
// the last change is never lost. The in-memory store updates immediately either
// way, so cross-pane live sync is unaffected.
const snapshot = createDebouncedWrite(
  () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        boards: store.boards,
        activeBoardId: store.activeBoardId,
      }),
    );
  },
  { flushOnPageHide: true },
);

export const persist = snapshot.schedule;
