import { createStore } from "solid-js/store";
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

// ── persistence ──

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
  // 1. load existing boards from localStorage (or migrate / bootstrap)
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const data = JSON.parse(raw) as BoardStore;
    setStore({ ...data, boards: data.boards.map(normalizeBoard) });
  } else {
    const legacy = migrateLegacy();
    if (legacy) {
      setStore({ boards: [legacy], activeBoardId: legacy.id });
    } else {
      const first = makeBoard("Board 1");
      setStore({ boards: [first], activeBoardId: first.id });
    }
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
    setStore("boards", (prev) => [...prev, board]);
    setStore("activeBoardId", board.id);
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

// ── board CRUD ──

export function createBoard(name?: string): string {
  const finalName = name
    ? deduplicateName(name, store.boards)
    : nextBoardName(store.boards);
  const board = makeBoard(finalName);
  setStore("boards", (prev) => [...prev, board]);
  setStore("activeBoardId", board.id);
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
  setStore("boards", (prev) => [...prev, board]);
  setStore("activeBoardId", board.id);
  persist();
  return board.id;
}

export function deleteBoard(id: string): void {
  const idx = store.boards.findIndex((b) => b.id === id);
  if (idx === -1) return;

  for (const s of store.boards[idx].stickies) {
    if (s.image) void deleteImage(s.image.id); // free this board's blobs
  }
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
  const idx = boardIndex(boardId);
  if (idx === -1) return;
  setStore("boards", idx, "bgColor", color);
  persist();
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
  setStore("boards", boardIdx, "threads", (prev) => [
    ...prev,
    { id: newId(), from, to },
  ]);
  persist();
}

export function deleteThread(boardId: string, id: string): void {
  const boardIdx = boardIndex(boardId);
  if (boardIdx === -1) return;
  setStore("boards", boardIdx, "threads", (prev) => prev.filter((t) => t.id !== id));
  persist();
}

// ── sticky CRUD ──

// Discrete edit (color, content). Persists; does NOT reorder.
export const updateStickyNote = (
  boardId: string,
  stickyId: string,
  update: Partial<StickyNote>
) => {
  const [boardIdx, idx] = locate(boardId, stickyId);
  if (idx === -1) return;
  setStore("boards", boardIdx, "stickies", idx, { ...update });
  persist();
};

// Transient high-frequency updates (drag / resize). No reorder, no persist —
// a single nested field write, so only the affected sticky re-renders. Call
// commitStickies() once on pointer release to flush to localStorage.
export const moveStickyNote = (boardId: string, stickyId: string, position: [number, number]) => {
  const [boardIdx, idx] = locate(boardId, stickyId);
  if (idx === -1) return;
  setStore("boards", boardIdx, "stickies", idx, "position", position);
};

export const resizeStickyNote = (boardId: string, stickyId: string, dimensions: [number, number]) => {
  const [boardIdx, idx] = locate(boardId, stickyId);
  if (idx === -1) return;
  setStore("boards", boardIdx, "stickies", idx, "dimensions", dimensions);
};

export const commitStickies = () => persist();

// One above the board's current top (z of the next note to stack on top).
const nextZ = (boardIdx: number): number =>
  store.boards[boardIdx].stickies.reduce((m, s) => Math.max(m, s.z), -1) + 1;

// Raise to top of the z-order + persist. No-op if already on top.
export const raiseSticky = (boardId: string, stickyId: string) => {
  const [boardIdx, idx] = locate(boardId, stickyId);
  if (idx === -1) return;
  const top = nextZ(boardIdx) - 1;
  if (store.boards[boardIdx].stickies[idx].z === top) return;
  setStore("boards", boardIdx, "stickies", idx, "z", top + 1);
  persist();
};

export const deleteStickyNote = (boardId: string, stickyId: string) => {
  const [boardIdx, idx] = locate(boardId, stickyId);
  if (idx === -1) return;
  const removed = store.boards[boardIdx].stickies[idx];
  setStore("boards", boardIdx, "stickies", (prev) => prev.filter((s) => s.id !== stickyId));
  setStore("boards", boardIdx, "threads", (prev) =>
    prev.filter((t) => t.from !== stickyId && t.to !== stickyId)
  );
  if (removed.image) void deleteImage(removed.image.id); // free the blob
  persist();
};

// Move a note from one board to another (cross-pane drag), centered on `world` in
// the target board. Its threads in the source board are dropped (threads are
// intra-board, so a moved note arrives with no connections).
export const moveStickyToBoard = (
  stickyId: string,
  fromBoardId: string,
  toBoardId: string,
  topLeft: { x: number; y: number } // the note's top-left in the target board's world
) => {
  if (fromBoardId === toBoardId) return;
  const from = store.boards.findIndex((b) => b.id === fromBoardId);
  const to = store.boards.findIndex((b) => b.id === toBoardId);
  if (from === -1 || to === -1) return;
  const sticky = store.boards[from].stickies.find((s) => s.id === stickyId);
  if (!sticky) return;
  // arrives on top of the TARGET board's stack
  const moved: StickyNote = { ...sticky, position: [topLeft.y, topLeft.x], z: nextZ(to) };
  setStore("boards", from, "stickies", (prev) => prev.filter((s) => s.id !== stickyId));
  setStore("boards", from, "threads", (prev) =>
    prev.filter((t) => t.from !== stickyId && t.to !== stickyId)
  );
  setStore("boards", to, "stickies", (prev) => [...prev, moved]);
  persist();
};

export const clearAllStickies = (boardId: string) => {
  const boardIdx = boardIndex(boardId);
  if (boardIdx === -1) return;
  for (const s of store.boards[boardIdx].stickies) {
    if (s.image) void deleteImage(s.image.id); // free the blobs
  }
  setStore("boards", boardIdx, "stickies", []);
  setStore("boards", boardIdx, "threads", []);
  persist();
};

// New notes always land on top — z is assigned here, never by the caller.
export const createStickyNote = (boardId: string, sticky: Omit<StickyNote, "z">) => {
  const boardIdx = boardIndex(boardId);
  if (boardIdx === -1) return;
  const stacked: StickyNote = { ...sticky, z: nextZ(boardIdx) };
  setStore("boards", boardIdx, "stickies", (prev) => [...prev, stacked]);
  persist();
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
  setStore("boards", boardIdx, "stickies", (prev) => [...prev, clone]);
  persist();
};

