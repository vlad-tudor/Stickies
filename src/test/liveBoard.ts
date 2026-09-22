// Harness for tests that need a board in a LIVE session, plus a second
// participant on it.
//
// Nothing here needs a server. `isPresenceLive(boardId)` is just
// `awarenessByBoard.has(boardId)`, so attaching a bare `new Awareness(doc)` is
// the whole of "this board is live" — and a peer is a second Awareness whose
// state we hand over by hand with encodeAwarenessUpdate/applyAwarenessUpdate,
// which is exactly what a provider does over the wire. Transport is what a real
// session adds; the semantics under test are all here.
import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from "y-protocols/awareness";
import { loadBoards, activeBoardId, type StickyNote } from "~/stores/stickyStore";
import { docOf } from "~/stores/board/boardDocs";
import { attachPresence, detachPresence } from "~/stores/board/presence";
import type { Tone } from "~/utils/tones";

export type LiveBoard = { boardId: string; local: Y.Doc; awareness: Awareness };

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const makeNote = (id: string, over: Partial<StickyNote> = {}): StickyNote => ({
  id,
  position: [0, 0],
  dimensions: [300, 320],
  content: "",
  color: "cream",
  z: 0,
  ...over,
});

// Fresh single-board store; returns the board id and its live local doc.
export const freshBoard = (): { boardId: string; local: Y.Doc } => {
  localStorage.clear();
  window.location.hash = "";
  loadBoards();
  const boardId = activeBoardId();
  const local = docOf(boardId);
  if (!local) throw new Error("active board has no doc");
  return { boardId, local };
};

// Boards this file has attached presence to, so teardown can let go of all of
// them: detachPresence also stops presence's 500ms sweep once the last board
// detaches, and a dangling interval outlives the test in bun's single process.
const attached = new Set<string>();

export const freshLiveBoard = (): LiveBoard => {
  const { boardId, local } = freshBoard();
  const awareness = new Awareness(local);
  attachPresence(boardId, awareness);
  attached.add(boardId);
  return { boardId, local, awareness };
};

export const releaseLiveBoards = (): void => {
  for (const boardId of attached) detachPresence(boardId);
  attached.clear();
};

// A second participant. The identity matters: rebuildBoardPresence ignores any
// awareness state without a `user` field, so a peer that never introduces
// itself is invisible no matter what else it publishes.
export const spawnPresencePeer = (name = "Peer", color: Tone = "sky"): Awareness => {
  const peer = new Awareness(new Y.Doc());
  peer.setLocalStateField("user", { name, color });
  return peer;
};

// Hand a participant's current state to the other side, the way a provider
// would. NB `change` — which is what attachPresence listens to — only fires
// when the state actually DIFFERS: applyAwarenessUpdate sorts a same-content
// higher-clock renew into `updated` but not `filteredUpdated`, and only the
// latter triggers `change`. So delivering an unchanged state rebuilds nothing.
export const deliverPresence = (from: Awareness, to: Awareness): void => {
  applyAwarenessUpdate(to, encodeAwarenessUpdate(from, [from.clientID]), "test");
};
