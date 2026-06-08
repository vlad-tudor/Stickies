import { createStore } from "solid-js/store";
import { marked } from "marked";
import { readBoardFromHash, clearHash } from "~/utils/urlState";
import { asTone, DEFAULT_TONE, type Tone } from "~/utils/tones";

const STORAGE_KEY = "stickies-boards";
const LEGACY_KEY = "stickies-storage";
const LEGACY_BG_KEY = "whiteboard-bg";

// Minimum sticky size (px). Width must fit the editor toolbar; height mirrors
// --total-sticky-height in sticky.scss — keep these in sync.
export const MIN_STICKY_WIDTH = 256;
export const MIN_STICKY_HEIGHT = 320;

export type StickyNote = {
  id: string;
  title?: string;
  position: [number, number];
  dimensions: [number, number];
  content: string; // markdown
  color: Tone;
};

// A link between two stickies (by id).
export type Thread = { id: string; from: string; to: string };

export type Board = {
  id: string;
  name: string;
  stickies: StickyNote[];
  threads: Thread[];
  bgColor: Tone;
};

// World-space center of a note (encapsulates position=[top,left], dims=[w,h]).
export const stickyCenter = (
  s: Pick<StickyNote, "position" | "dimensions">
): { x: number; y: number } => ({
  x: s.position[1] + s.dimensions[0] / 2,
  y: s.position[0] + s.dimensions[1] / 2,
});

// Where a thread attaches: the connect dot — horizontal center, band middle.
// 16 = half the band height (--total-sticky-handle-height, 2rem) in sticky.scss.
export const threadAnchor = (
  s: Pick<StickyNote, "position" | "dimensions">
): { x: number; y: number } => ({
  x: s.position[1] + s.dimensions[0] / 2,
  y: s.position[0] + 16,
});

type BoardStore = {
  boards: Board[];
  activeBoardId: string;
};

const [store, setStore] = createStore<BoardStore>({
  boards: [],
  activeBoardId: "",
});

// ── persistence ──

const persist = () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ boards: store.boards, activeBoardId: store.activeBoardId })
  );
};

function makeBoard(
  name: string,
  stickies: StickyNote[] = [],
  bgColor: Tone = DEFAULT_TONE,
  threads: Thread[] = []
): Board {
  return { id: Date.now().toString(), name, stickies, threads, bgColor };
}

// Drop threads whose endpoints no longer exist (deleted/replaced stickies).
const normalizeThreads = (
  threads: Thread[] | undefined,
  stickies: StickyNote[]
): Thread[] => {
  if (!threads) return [];
  const ids = new Set(stickies.map((s) => s.id));
  return threads.filter((t) => ids.has(t.from) && ids.has(t.to));
};

// Content is HTML. Legacy notes stored markdown — convert them once on ingest.
const looksLikeHtml = (s: string): boolean => /<\/?[a-z][\s\S]*>/i.test(s);
const asHtml = (content: string): string =>
  !content || looksLikeHtml(content) ? content : (marked(content) as string);

// Coerce persisted/imported notes: legacy hex colors -> tones, markdown -> HTML.
const normalizeStickies = (stickies: StickyNote[]): StickyNote[] =>
  stickies.map((s) => ({ ...s, color: asTone(s.color), content: asHtml(s.content) }));

const normalizeBoard = (b: Board): Board => {
  const stickies = normalizeStickies(b.stickies);
  return {
    ...b,
    bgColor: asTone(b.bgColor),
    stickies,
    threads: normalizeThreads(b.threads, stickies),
  };
};

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

function deduplicateName(base: string, boards: Board[]): string {
  const names = new Set(boards.map((b) => b.name));
  if (!names.has(base)) return base;
  let i = 1;
  while (names.has(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

// Lowest free "Board N" — count-based numbering clashes after deletes.
function nextBoardName(boards: Board[]): string {
  const names = new Set(boards.map((b) => b.name));
  let n = boards.length + 1;
  while (names.has(`Board ${n}`)) n++;
  return `Board ${n}`;
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
    let name = deduplicateName(shared.name, store.boards);
    const renamed = prompt("Name this shared board:", name);
    name = renamed?.trim() || name;

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

const activeBoardIndex = (): number =>
  store.boards.findIndex((b) => b.id === store.activeBoardId);

export const activeBoard = (): Board | undefined =>
  store.boards.find((b) => b.id === store.activeBoardId);

export const stickies = (): StickyNote[] => activeBoard()?.stickies ?? [];
export const threads = (): Thread[] => activeBoard()?.threads ?? [];
export const activeBgColor = (): Tone => activeBoard()?.bgColor ?? DEFAULT_TONE;

// ── board CRUD ──

export function createBoard(name?: string): void {
  const finalName = name
    ? deduplicateName(name, store.boards)
    : nextBoardName(store.boards);
  const board = makeBoard(finalName);
  setStore("boards", (prev) => [...prev, board]);
  setStore("activeBoardId", board.id);
  persist();
}

export function deleteBoard(id: string): void {
  const idx = store.boards.findIndex((b) => b.id === id);
  if (idx === -1) return;

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

export function updateBoardBgColor(color: Tone): void {
  const idx = activeBoardIndex();
  if (idx === -1) return;
  setStore("boards", idx, "bgColor", color);
  persist();
}

// ── thread CRUD (operates on active board) ──

export function addThread(from: string, to: string): void {
  if (from === to) return;
  const boardIdx = activeBoardIndex();
  if (boardIdx === -1) return;
  const existing = store.boards[boardIdx].threads;
  // skip duplicates (either direction)
  if (existing.some((t) => (t.from === from && t.to === to) || (t.from === to && t.to === from))) {
    return;
  }
  setStore("boards", boardIdx, "threads", (prev) => [
    ...prev,
    { id: Date.now().toString(), from, to },
  ]);
  persist();
}

export function deleteThread(id: string): void {
  const boardIdx = activeBoardIndex();
  if (boardIdx === -1) return;
  setStore("boards", boardIdx, "threads", (prev) => prev.filter((t) => t.id !== id));
  persist();
}

// ── sticky CRUD (operates on active board) ──

const bringToFront = (stickyIdx: number) => {
  const boardIdx = activeBoardIndex();
  if (boardIdx === -1) return;
  const sticky = store.boards[boardIdx].stickies[stickyIdx];
  const rest = store.boards[boardIdx].stickies.filter((_, i) => i !== stickyIdx);
  setStore("boards", boardIdx, "stickies", [...rest, sticky]);
};

// Discrete edit (title, color, content). Persists; does NOT reorder.
export const updateStickyNote = (
  index: number,
  update: Partial<StickyNote>
) => {
  const boardIdx = activeBoardIndex();
  if (boardIdx === -1) return;
  setStore("boards", boardIdx, "stickies", index, { ...update });
  persist();
};

// Transient high-frequency updates (drag / resize). No reorder, no persist —
// a single nested field write, so only the affected sticky re-renders. Call
// commitStickies() once on pointer release to flush to localStorage.
export const moveStickyNote = (index: number, position: [number, number]) => {
  const boardIdx = activeBoardIndex();
  if (boardIdx === -1) return;
  setStore("boards", boardIdx, "stickies", index, "position", position);
};

export const resizeStickyNote = (index: number, dimensions: [number, number]) => {
  const boardIdx = activeBoardIndex();
  if (boardIdx === -1) return;
  setStore("boards", boardIdx, "stickies", index, "dimensions", dimensions);
};

export const commitStickies = () => persist();

// Raise to top of the z-order (by id) + persist. No-op if already on top.
export const raiseStickyById = (id: string) => {
  const boardIdx = activeBoardIndex();
  if (boardIdx === -1) return;
  const list = store.boards[boardIdx].stickies;
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1 || idx === list.length - 1) return;
  bringToFront(idx);
  persist();
};

export const deleteStickyNote = (index: number) => {
  const boardIdx = activeBoardIndex();
  if (boardIdx === -1) return;
  const removed = store.boards[boardIdx].stickies[index];
  setStore(
    "boards",
    boardIdx,
    "stickies",
    (prev) => prev.filter((_, i) => i !== index)
  );
  if (removed) {
    setStore("boards", boardIdx, "threads", (prev) =>
      prev.filter((t) => t.from !== removed.id && t.to !== removed.id)
    );
  }
  persist();
};

export const clearAllStickies = () => {
  const boardIdx = activeBoardIndex();
  if (boardIdx === -1) return;
  setStore("boards", boardIdx, "stickies", []);
  setStore("boards", boardIdx, "threads", []);
  persist();
};

export const createStickyNote = (sticky: StickyNote) => {
  const boardIdx = activeBoardIndex();
  if (boardIdx === -1) return;
  setStore("boards", boardIdx, "stickies", (prev) => [...prev, sticky]);
  persist();
};

const STACK_LEFT = 50;
const STACK_TOP = 100;
const STACK_OFFSET = 30;

export const stackAllStickies = () => {
  const boardIdx = activeBoardIndex();
  if (boardIdx === -1) return;
  const current = store.boards[boardIdx].stickies;
  const updated = current.map((s, i) => ({
    ...s,
    position: [STACK_TOP + i * STACK_OFFSET, STACK_LEFT + i * STACK_OFFSET] as [number, number],
  }));
  setStore("boards", boardIdx, "stickies", updated);
  persist();
};

export const importStickies = (imported: StickyNote[]) => {
  const boardIdx = activeBoardIndex();
  if (boardIdx === -1) return;
  const next = normalizeStickies(imported);
  setStore("boards", boardIdx, "stickies", next);
  setStore("boards", boardIdx, "threads", (prev) => normalizeThreads(prev, next));
  persist();
};

export const exportStickies = (): string => {
  return JSON.stringify(stickies(), null, 2);
};
