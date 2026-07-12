import * as Y from "yjs";
import {
  attachDocPersistence,
  detachDocPersistence,
  clearDocPersistence,
  canPersistDocs,
} from "~/stores/board/docPersistence";
import { readBoardFromHash, clearHash } from "~/utils/urlState";
import { deleteImage } from "~/utils/imageStore";
import { newId } from "~/utils/id";
import { asTone, type Tone } from "~/utils/tones";
import {
  makeBoard,
  normalizeBoard,
  normalizeStickies,
  normalizeThreads,
  deduplicateName,
  nextBoardName,
  type Board,
  type StickyNote,
} from "~/domain/board";
import {
  seedDoc,
  registerDoc,
  destroyDoc,
  allDocIds,
  transact,
  metaMapOf,
  MetaKey,
} from "./boardDocs";
import {
  store,
  setStore,
  StoreKey,
  BoardKey,
  boardIndex,
  installDoc,
  appendToProjection,
  syncBoardFromDoc,
  dropGeometryDirty,
  persist,
  STORAGE_KEY,
  type BoardStore,
} from "./boardProjection";

// Board-level operations: load/lifecycle and registry CRUD (list, names,
// order, active board). Board CONTENT mutations live in stickyActions.

const LEGACY_KEY = "stickies-storage";
const LEGACY_BG_KEY = "whiteboard-bg";

// ── lifecycle ──

// Bring a NEW board (created/duplicated/imported this session) into the store:
// seed its doc, attach observers + persistence, add to the projection.
const registerBoard = (board: Board, activate: boolean): void => {
  const doc = new Y.Doc();
  seedDoc(doc, board);
  registerDoc(board.id, doc);
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
  registerDoc(board.id, doc);
  installDoc(board.id, doc);
  if (canPersistDocs) {
    attachDocPersistence(board.id, doc, () => {
      if (!metaMapOf(doc).get(MetaKey.Init)) seedDoc(doc, board);
      else syncBoardFromDoc(board.id);
    });
  }
  appendToProjection(board);
};

// Bring a board JOINED from a live session into the store: an EMPTY doc that
// fills over the wire once the provider connects. Never seeded locally — a
// seed would write init/bgColor into the SHARED doc and could clobber the
// host's meta. The projection shows an empty board until the room state lands.
export function registerJoinedBoard(name: string): string {
  const board = makeBoard(deduplicateName(name, store.boards));
  const doc = new Y.Doc();
  registerDoc(board.id, doc);
  installDoc(board.id, doc);
  attachDocPersistence(board.id, doc);
  appendToProjection(board);
  setStore(StoreKey.ActiveBoardId, board.id);
  persist();
  return board.id;
}

const dropBoard = (boardId: string): void => {
  detachDocPersistence(boardId);
  destroyDoc(boardId);
  dropGeometryDirty(boardId);
};

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
  for (const boardId of allDocIds()) dropBoard(boardId);
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

// ── registry CRUD ──

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
  dropBoard(id);
  setStore(StoreKey.Boards, (existing) =>
    existing.filter((board) => board.id !== id),
  );

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
  const deduped = deduplicateName(name, others);
  setStore(StoreKey.Boards, boardIdx, BoardKey.Name, deduped);
  // replicate into the doc so live-session peers follow the rename (the meta
  // observer skips-if-equal, so this doesn't loop locally)
  transact(id, (doc) => metaMapOf(doc).set(MetaKey.Name, deduped));
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
