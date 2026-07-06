import { createStore, reconcile } from "solid-js/store";
import * as Y from "yjs";
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
//   doc.getMap("meta")      { bgColor }
//   doc.getMap("stickies")  id -> Y.Map of note fields  (per-FIELD last-write-wins)
//   doc.getMap("threads")   id -> plain Thread          (immutable: add/remove only)
// The solid store below is a read-only PROJECTION of the docs — every consumer
// keeps reading it reactively; every mutation writes the doc, and a doc observer
// reconciles the projection. The board LIST (names, tab order, active id) is
// local-only registry state, not shared: sharing hands over a board, not your
// workspace.
//
// No provider is wired yet (local-only step). The y-websocket relay client and
// y-indexeddb attach to these same docs later without touching the mutations.

const STORAGE_KEY = "stickies-boards";
const LEGACY_KEY = "stickies-storage";
const LEGACY_BG_KEY = "whiteboard-bg";

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
// Their mirror position/dimensions are ahead of the doc until commitStickies().
const dirtyGeometry = new Map<string, Set<string>>();

// Projection arrays are id-sorted: Y.Map has no order, so the array order of
// `stickies`/`threads` carries NO meaning (stacking is the explicit z field).
const byId = <T extends { id: string }>(a: T, b: T): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

const yNote = (s: StickyNote): Y.Map<unknown> => {
  const m = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(s)) {
    if (v !== undefined) m.set(k, v);
  }
  return m;
};

const docFromBoard = (board: Board): Y.Doc => {
  const doc = new Y.Doc();
  doc.transact(() => {
    doc.getMap("meta").set("bgColor", board.bgColor);
    const sm = doc.getMap("stickies");
    for (const s of board.stickies) sm.set(s.id, yNote(s));
    const tm = doc.getMap("threads");
    for (const t of board.threads) tm.set(t.id, t);
  });
  return doc;
};

// Rebuild one board's projection from its doc (fires after every transaction).
// reconcile() keyed by id keeps unchanged notes referentially stable, so only
// the touched notes re-render. Notes with in-flight transient geometry keep the
// mirror's position/dimensions (the doc only has the last committed ones).
const syncBoardFromDoc = (boardId: string): void => {
  const doc = docs.get(boardId);
  const idx = boardIndex(boardId);
  if (!doc || idx === -1) return;

  const dirty = dirtyGeometry.get(boardId);
  const current = new Map(store.boards[idx].stickies.map((s) => [s.id, s]));

  const stickies: StickyNote[] = [];
  doc.getMap("stickies").forEach((yn, id) => {
    const s = (yn as Y.Map<unknown>).toJSON() as StickyNote;
    const cur = dirty?.has(id) ? current.get(id) : undefined;
    if (cur) {
      s.position = cur.position;
      s.dimensions = cur.dimensions;
    }
    stickies.push(s);
  });
  stickies.sort(byId);

  const threads = (Object.values(doc.getMap("threads").toJSON()) as Thread[]).sort(byId);

  setStore("boards", idx, "stickies", reconcile(stickies, { key: "id" }));
  setStore("boards", idx, "threads", reconcile(threads, { key: "id" }));
  setStore("boards", idx, "bgColor", asTone(doc.getMap("meta").get("bgColor")));
};

// Create the doc for a (normalized) board, attach its projection observer, and
// add it to the registry/projection. The one entry point for new boards.
const registerBoard = (board: Board, activate: boolean): void => {
  const doc = docFromBoard(board);
  docs.set(board.id, doc);
  doc.on("update", () => syncBoardFromDoc(board.id));
  setStore("boards", (prev) => [
    ...prev,
    { ...board, stickies: [...board.stickies].sort(byId), threads: [...board.threads].sort(byId) },
  ]);
  if (activate) setStore("activeBoardId", board.id);
};

const dropBoardDoc = (boardId: string): void => {
  docs.get(boardId)?.destroy();
  docs.delete(boardId);
  dirtyGeometry.delete(boardId);
};

// Run `fn` in a transaction on the board's doc; the observer syncs the
// projection synchronously before this returns. False if the board is gone.
const transact = (boardId: string, fn: (doc: Y.Doc) => void): boolean => {
  const doc = docs.get(boardId);
  if (!doc || boardIndex(boardId) === -1) return false;
  doc.transact(() => fn(doc));
  return true;
};

// ── persistence ──
// A JSON snapshot of the projection, same format as ever (boards + active id) —
// existing data loads unchanged, and boards() keeps feeding share URLs. Once the
// provider lands, doc persistence moves to y-indexeddb (update history survives
// offline edits); this snapshot then only carries the registry.

let persistTimer: ReturnType<typeof setTimeout> | undefined;

const writeNow = () => {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = undefined;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ boards: store.boards, activeBoardId: store.activeBoardId })
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
  const stickies = normalizeStickies(JSON.parse(raw) as StickyNote[]);
  const bgColor = asTone(localStorage.getItem(LEGACY_BG_KEY));
  localStorage.removeItem(LEGACY_KEY);
  localStorage.removeItem(LEGACY_BG_KEY);
  return makeBoard("My Board", stickies, bgColor);
}

export function loadBoards(): void {
  // reset (tests / re-entry): drop every doc and start from persisted state
  for (const id of [...docs.keys()]) dropBoardDoc(id);
  setStore({ boards: [], activeBoardId: "" });

  // 1. load existing boards from localStorage (or migrate / bootstrap)
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const data = JSON.parse(raw) as BoardStore;
    for (const b of data.boards) registerBoard(normalizeBoard(b), false);
    setStore(
      "activeBoardId",
      store.boards.some((b) => b.id === data.activeBoardId)
        ? data.activeBoardId
        : store.boards[0]?.id ?? ""
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
    const name = deduplicateName(`${shared.name} (imported ${stamp})`, store.boards);

    const sharedStickies = normalizeStickies(shared.stickies);
    const board = makeBoard(
      name,
      sharedStickies,
      asTone(shared.bgColor),
      normalizeThreads(shared.threads, sharedStickies)
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
  store.boards.findIndex((b) => b.id === boardId);

// (boardId, stickyId) -> [boardIdx, stickyIdx], [-1, -1]-ish when either is gone.
const locate = (boardId: string, stickyId: string): [number, number] => {
  const b = boardIndex(boardId);
  if (b === -1) return [-1, -1];
  return [b, store.boards[b].stickies.findIndex((s) => s.id === stickyId)];
};

export const activeBoard = (): Board | undefined =>
  store.boards.find((b) => b.id === store.activeBoardId);

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
  const src = store.boards.find((b) => b.id === id);
  if (!src) return null;
  const idMap = new Map<string, string>();
  const stickies = src.stickies.map((s) => {
    const nid = newId();
    idMap.set(s.id, nid);
    return { ...s, id: nid };
  });
  const threads = src.threads.map((t) => ({
    id: newId(),
    from: idMap.get(t.from) ?? t.from,
    to: idMap.get(t.to) ?? t.to,
  }));
  const board = makeBoard(
    deduplicateName(`${src.name} (copy)`, store.boards),
    stickies,
    src.bgColor,
    threads
  );
  registerBoard(board, true);
  persist();
  return board.id;
}

export function deleteBoard(id: string): void {
  const idx = store.boards.findIndex((b) => b.id === id);
  if (idx === -1) return;

  for (const s of store.boards[idx].stickies) {
    if (s.image) void deleteImage(s.image.id); // free this board's blobs
  }
  dropBoardDoc(id);
  setStore("boards", (prev) => prev.filter((b) => b.id !== id));

  // if we deleted the active board, switch to a neighbour (or none if empty)
  if (store.activeBoardId === id) {
    const next = store.boards[Math.min(idx, store.boards.length - 1)];
    setStore("activeBoardId", next ? next.id : "");
  }
  persist();
}

export function renameBoard(id: string, name: string): void {
  const idx = store.boards.findIndex((b) => b.id === id);
  if (idx === -1) return;
  const others = store.boards.filter((b) => b.id !== id);
  setStore("boards", idx, "name", deduplicateName(name, others));
  persist();
}

export function switchBoard(id: string): void {
  if (store.boards.some((b) => b.id === id)) {
    setStore("activeBoardId", id);
    persist();
  }
}

// Move board `fromId` to the slot of `targetId` (drag-reorder of tabs).
export function reorderBoards(fromId: string, targetId: string): void {
  const from = store.boards.findIndex((b) => b.id === fromId);
  const to = store.boards.findIndex((b) => b.id === targetId);
  if (from === -1 || to === -1 || from === to) return;
  const next = [...store.boards];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  setStore("boards", next);
  persist();
}

// Move board `id` to `toIndex` in the array AFTER it's removed (0..length-1). Used by
// the tab sortable, which commits the final position once on drop.
export function reorderBoardTo(id: string, toIndex: number): void {
  const from = store.boards.findIndex((b) => b.id === id);
  if (from === -1) return;
  const next = [...store.boards];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, moved);
  if (next.every((b, i) => b.id === store.boards[i].id)) return; // no change
  setStore("boards", next);
  persist();
}

export function updateBoardBgColor(boardId: string, color: Tone): void {
  if (transact(boardId, (doc) => doc.getMap("meta").set("bgColor", color))) persist();
}

// ── thread CRUD ──

export function addThread(boardId: string, from: string, to: string): void {
  if (from === to) return;
  const boardIdx = boardIndex(boardId);
  if (boardIdx === -1) return;
  const board = store.boards[boardIdx];
  // both endpoints must live on THIS board — a connect drop can land on a note
  // in another pane's board, which isn't a link (threads are intra-board)
  const ids = new Set(board.stickies.map((s) => s.id));
  if (!ids.has(from) || !ids.has(to)) return;
  // skip duplicates (either direction)
  if (board.threads.some((t) => (t.from === from && t.to === to) || (t.from === to && t.to === from))) {
    return;
  }
  const id = newId();
  if (transact(boardId, (doc) => doc.getMap("threads").set(id, { id, from, to }))) persist();
}

export function deleteThread(boardId: string, id: string): void {
  if (transact(boardId, (doc) => doc.getMap("threads").delete(id))) persist();
}

// ── sticky CRUD ──

// Set `update`'s fields on the note's Y.Map — field-level writes, so concurrent
// edits to DIFFERENT fields of one note both survive (per-field LWW).
const setNoteFields = (doc: Y.Doc, stickyId: string, update: Partial<StickyNote>): void => {
  const yn = doc.getMap("stickies").get(stickyId) as Y.Map<unknown> | undefined;
  if (!yn) return;
  for (const [k, v] of Object.entries(update)) {
    if (v !== undefined) yn.set(k, v);
  }
};

// Discrete edit (color, content). Persists; does NOT reorder.
export const updateStickyNote = (
  boardId: string,
  stickyId: string,
  update: Partial<StickyNote>
) => {
  if (transact(boardId, (doc) => setNoteFields(doc, stickyId, update))) persist();
};

// Transient high-frequency updates (drag / resize). PROJECTION-only writes — no
// doc transaction, no persist — so a drag frame costs one nested signal write.
// The note is marked geometry-dirty; commitStickies() (pointer release) writes
// the final geometry into the doc. (Once live, a throttle will also flush
// mid-drag so remote peers see the motion.)
const markDirty = (boardId: string, stickyId: string): void => {
  let set = dirtyGeometry.get(boardId);
  if (!set) dirtyGeometry.set(boardId, (set = new Set()));
  set.add(stickyId);
};

export const moveStickyNote = (boardId: string, stickyId: string, position: [number, number]) => {
  const [boardIdx, idx] = locate(boardId, stickyId);
  if (idx === -1) return;
  markDirty(boardId, stickyId);
  setStore("boards", boardIdx, "stickies", idx, "position", position);
};

export const resizeStickyNote = (boardId: string, stickyId: string, dimensions: [number, number]) => {
  const [boardIdx, idx] = locate(boardId, stickyId);
  if (idx === -1) return;
  markDirty(boardId, stickyId);
  setStore("boards", boardIdx, "stickies", idx, "dimensions", dimensions);
};

// Flush every note's transient geometry into its board's doc (one transaction
// per board), then persist. Called once on pointer release.
export const commitStickies = () => {
  for (const [boardId, ids] of [...dirtyGeometry]) {
    const boardIdx = boardIndex(boardId);
    const pending =
      boardIdx === -1
        ? []
        : store.boards[boardIdx].stickies.filter((s) => ids.has(s.id));
    dirtyGeometry.delete(boardId); // clear FIRST so the sync reads the doc's values
    if (pending.length === 0) continue;
    transact(boardId, (doc) => {
      for (const s of pending) {
        setNoteFields(doc, s.id, { position: s.position, dimensions: s.dimensions });
      }
    });
  }
  persist();
};

// One above the board's current top (z of the next note to stack on top).
const nextZ = (boardIdx: number): number =>
  store.boards[boardIdx].stickies.reduce((m, s) => Math.max(m, s.z), -1) + 1;

// Raise to top of the z-order + persist. No-op if already on top.
export const raiseSticky = (boardId: string, stickyId: string) => {
  const [boardIdx, idx] = locate(boardId, stickyId);
  if (idx === -1) return;
  const top = nextZ(boardIdx) - 1;
  if (store.boards[boardIdx].stickies[idx].z === top) return;
  if (transact(boardId, (doc) => setNoteFields(doc, stickyId, { z: top + 1 }))) persist();
};

export const deleteStickyNote = (boardId: string, stickyId: string) => {
  const [boardIdx, idx] = locate(boardId, stickyId);
  if (idx === -1) return;
  const removed = store.boards[boardIdx].stickies[idx];
  dirtyGeometry.get(boardId)?.delete(stickyId);
  transact(boardId, (doc) => {
    doc.getMap("stickies").delete(stickyId);
    const tm = doc.getMap("threads");
    for (const [tid, t] of Object.entries(tm.toJSON() as Record<string, Thread>)) {
      if (t.from === stickyId || t.to === stickyId) tm.delete(tid);
    }
  });
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
  topLeft: { x: number; y: number } // the note's top-left in the target board's world
) => {
  if (fromBoardId === toBoardId) return;
  const to = boardIndex(toBoardId);
  const sticky = store.boards[boardIndex(fromBoardId)]?.stickies.find((s) => s.id === stickyId);
  if (!sticky || to === -1) return;
  // arrives on top of the TARGET board's stack
  const moved: StickyNote = { ...sticky, position: [topLeft.y, topLeft.x], z: nextZ(to) };
  dirtyGeometry.get(fromBoardId)?.delete(stickyId);
  transact(toBoardId, (doc) => doc.getMap("stickies").set(moved.id, yNote(moved)));
  transact(fromBoardId, (doc) => {
    doc.getMap("stickies").delete(stickyId);
    const tm = doc.getMap("threads");
    for (const [tid, t] of Object.entries(tm.toJSON() as Record<string, Thread>)) {
      if (t.from === stickyId || t.to === stickyId) tm.delete(tid);
    }
  });
  persist();
};

export const clearAllStickies = (boardId: string) => {
  const boardIdx = boardIndex(boardId);
  if (boardIdx === -1) return;
  for (const s of store.boards[boardIdx].stickies) {
    if (s.image) void deleteImage(s.image.id); // free the blobs
  }
  dirtyGeometry.delete(boardId);
  transact(boardId, (doc) => {
    doc.getMap("stickies").clear();
    doc.getMap("threads").clear();
  });
  persist();
};

// New notes always land on top — z is assigned here, never by the caller.
export const createStickyNote = (boardId: string, sticky: Omit<StickyNote, "z">) => {
  const boardIdx = boardIndex(boardId);
  if (boardIdx === -1) return;
  const stacked: StickyNote = { ...sticky, z: nextZ(boardIdx) };
  if (transact(boardId, (doc) => doc.getMap("stickies").set(stacked.id, yNote(stacked)))) {
    persist();
  }
};

// Duplicate a note beside itself (new id, offset down-right, top of the z-order).
// Threads are NOT copied — a duplicate has no connections.
export const duplicateStickyNote = (boardId: string, stickyId: string) => {
  const [boardIdx, idx] = locate(boardId, stickyId);
  if (idx === -1) return;
  const src = store.boards[boardIdx].stickies[idx];
  const clone: StickyNote = {
    ...src,
    id: newId(),
    position: [src.position[0] + 24, src.position[1] + 24],
    z: nextZ(boardIdx),
  };
  if (transact(boardId, (doc) => doc.getMap("stickies").set(clone.id, yNote(clone)))) {
    persist();
  }
};
