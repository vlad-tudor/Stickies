import { deleteImage } from "~/utils/imageStore";
import { newId } from "~/utils/id";
import type { StickyNote } from "~/domain/board";
import {
  transact,
  stickyMapOf,
  threadMapOf,
  noteToY,
  setNoteFieldsInDoc,
  deleteNoteFromDoc,
} from "./boardDocs";
import {
  store,
  setStore,
  StoreKey,
  BoardKey,
  NoteKey,
  boardIndex,
  locate,
  markGeometryDirty,
  unmarkGeometryDirty,
  dropGeometryDirty,
  geometryDirtyEntries,
  persist,
} from "./boardProjection";

// Board CONTENT mutations: stickies and the threads linking them. Every write
// goes through the board's doc (transact) — the projection follows via the
// observers — except transient drag/resize geometry, which writes the
// projection directly and flushes into the doc on commit.

// ── threads ──

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

// ── stickies ──

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
export const moveStickyNote = (
  boardId: string,
  stickyId: string,
  position: [number, number],
) => {
  const [boardIdx, stickyIdx] = locate(boardId, stickyId);
  if (stickyIdx === -1) return;
  markGeometryDirty(boardId, stickyId);
  setStore(
    StoreKey.Boards,
    boardIdx,
    BoardKey.Stickies,
    stickyIdx,
    NoteKey.Position,
    position,
  );
};

export const resizeStickyNote = (
  boardId: string,
  stickyId: string,
  dimensions: [number, number],
) => {
  const [boardIdx, stickyIdx] = locate(boardId, stickyId);
  if (stickyIdx === -1) return;
  markGeometryDirty(boardId, stickyId);
  setStore(
    StoreKey.Boards,
    boardIdx,
    BoardKey.Stickies,
    stickyIdx,
    NoteKey.Dimensions,
    dimensions,
  );
};

// Flush every note's transient geometry into its board's doc (one transaction
// per board), then persist. Called once on pointer release.
export const commitStickies = () => {
  for (const [boardId, dirtyIds] of geometryDirtyEntries()) {
    const boardIdx = boardIndex(boardId);
    const pendingNotes =
      boardIdx === -1
        ? []
        : store.boards[boardIdx].stickies.filter((sticky) =>
            dirtyIds.has(sticky.id),
          );
    dropGeometryDirty(boardId); // clear FIRST so the sync reads the doc's values
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
  unmarkGeometryDirty(boardId, stickyId);
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
  unmarkGeometryDirty(fromBoardId, stickyId);
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
  dropGeometryDirty(boardId);
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
