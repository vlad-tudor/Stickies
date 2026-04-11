import { createStore } from "solid-js/store";
import { readBoardFromHash, clearHash } from "~/utils/urlState";

const STORAGE_KEY = "stickies-boards";
const LEGACY_KEY = "stickies-storage";
const LEGACY_BG_KEY = "whiteboard-bg";
const DEFAULT_BG = "#f3ebe2";

export type StickyNote = {
  id: string;
  title?: string;
  position: [number, number];
  dimensions: [number, number];
  content: string; // markdown
  color: string;
};

export type Board = {
  id: string;
  name: string;
  stickies: StickyNote[];
  bgColor: string;
};

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

function makeBoard(name: string, stickies: StickyNote[] = [], bgColor = DEFAULT_BG): Board {
  return { id: Date.now().toString(), name, stickies, bgColor };
}

/**
 * Migrate from the old single-board localStorage format.
 * Returns a board if legacy data was found, otherwise null.
 */
function migrateLegacy(): Board | null {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return null;
  const stickies = JSON.parse(raw) as StickyNote[];
  const bgColor = localStorage.getItem(LEGACY_BG_KEY) ?? DEFAULT_BG;
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

export function loadBoards(): void {
  // 1. load existing boards from localStorage (or migrate / bootstrap)
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const data = JSON.parse(raw) as BoardStore;
    setStore(data);
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

    const board = makeBoard(name, shared.stickies, shared.bgColor);
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
export const activeBgColor = (): string => activeBoard()?.bgColor ?? DEFAULT_BG;

// ── board CRUD ──

export function createBoard(name?: string): void {
  const board = makeBoard(name ?? `Board ${store.boards.length + 1}`);
  setStore("boards", (prev) => [...prev, board]);
  setStore("activeBoardId", board.id);
  persist();
}

export function deleteBoard(id: string): void {
  if (store.boards.length <= 1) return; // always keep at least one
  const idx = store.boards.findIndex((b) => b.id === id);
  if (idx === -1) return;

  setStore("boards", (prev) => prev.filter((b) => b.id !== id));

  // if we deleted the active board, switch to a neighbour
  if (store.activeBoardId === id) {
    const next = store.boards[Math.min(idx, store.boards.length - 1)];
    setStore("activeBoardId", next.id);
  }
  persist();
}

export function renameBoard(id: string, name: string): void {
  const idx = store.boards.findIndex((b) => b.id === id);
  if (idx === -1) return;
  setStore("boards", idx, "name", name);
  persist();
}

export function switchBoard(id: string): void {
  if (store.boards.some((b) => b.id === id)) {
    setStore("activeBoardId", id);
    persist();
  }
}

export function updateBoardBgColor(color: string): void {
  const idx = activeBoardIndex();
  if (idx === -1) return;
  setStore("boards", idx, "bgColor", color);
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

export const updateStickyNote = (
  index: number,
  update: Partial<StickyNote>
) => {
  const boardIdx = activeBoardIndex();
  if (boardIdx === -1) return;
  setStore("boards", boardIdx, "stickies", index, { ...update });
  bringToFront(index);
  persist();
};

export const deleteStickyNote = (index: number) => {
  const boardIdx = activeBoardIndex();
  if (boardIdx === -1) return;
  setStore(
    "boards",
    boardIdx,
    "stickies",
    (prev) => prev.filter((_, i) => i !== index)
  );
  persist();
};

export const clearAllStickies = () => {
  const boardIdx = activeBoardIndex();
  if (boardIdx === -1) return;
  setStore("boards", boardIdx, "stickies", []);
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
  setStore("boards", boardIdx, "stickies", imported);
  persist();
};

export const exportStickies = (): string => {
  return JSON.stringify(stickies(), null, 2);
};
