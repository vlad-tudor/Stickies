// The LIVE gate: every other test in this suite runs with presence detached, so
// `isPresenceLive(boardId)` is false and the mid-drag path never executes —
// `scheduleLiveGeometryFlush` returns on its first line. That path is what a
// real session spends a drag inside, and it is the one the undo/redo origin
// work will disturb, so it needs to be reachable under test first.
//
// No server and no production change are required to reach it: the gate is just
// `awarenessByBoard.has(boardId)`, so attaching a bare `new Awareness(doc)` is
// enough to turn a board live. That is the same seam `presence-fields.test.ts`
// already relies on.
import { test, expect, describe, afterEach } from "bun:test";
import type * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import {
  loadBoards,
  activeBoardId,
  stickies,
  createStickyNote,
  moveStickyNote,
  commitStickies,
  type StickyNote,
} from "~/stores/stickyStore";
import { docOf, stickyMapOf } from "~/stores/board/boardDocs";
import { attachPresence, detachPresence } from "~/stores/board/presence";

// > LIVE_DRAG_FLUSH_MS (90) in stickyActions, with room for timer slop.
const PAST_FLUSH_MS = 120;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const makeNote = (id: string, over: Partial<StickyNote> = {}): StickyNote => ({
  id,
  position: [0, 0],
  dimensions: [300, 320],
  content: "",
  color: "cream",
  z: 0,
  ...over,
});

// Fresh single-board store; returns the board id and its live local doc.
const freshBoard = (): { boardId: string; local: Y.Doc } => {
  localStorage.clear();
  window.location.hash = "";
  loadBoards();
  const boardId = activeBoardId();
  const local = docOf(boardId);
  if (!local) throw new Error("active board has no doc");
  return { boardId, local };
};

// Boards attached this test, detached in teardown: detachPresence also stops
// presence's 500ms sweep once the last board lets go, so skipping it leaves an
// interval dangling for the rest of the process.
const attached = new Set<string>();

const freshLiveBoard = (): { boardId: string; local: Y.Doc; awareness: Awareness } => {
  const { boardId, local } = freshBoard();
  const awareness = new Awareness(local);
  attachPresence(boardId, awareness);
  attached.add(boardId);
  return { boardId, local, awareness };
};

afterEach(() => {
  // bun runs every test file in ONE process, so a pending flush would otherwise
  // fire into the next test's board.
  commitStickies();
  for (const boardId of attached) detachPresence(boardId);
  attached.clear();
});

const docPosition = (local: Y.Doc, id: string): unknown =>
  stickyMapOf(local).get(id)!.get("position");

const projectionNote = (id: string): StickyNote | undefined =>
  stickies().find((sticky) => sticky.id === id);

describe("live boards stream geometry mid-drag", () => {
  test("a live board flushes in-flight geometry into the doc before release", async () => {
    const { boardId, local } = freshLiveBoard();
    createStickyNote(boardId, makeNote("a", { position: [0, 0] }));

    // a drag frame: projection-only write, NOT committed
    moveStickyNote(boardId, "a", [111, 111]);
    expect(docPosition(local, "a")).toEqual([0, 0]);

    await sleep(PAST_FLUSH_MS);

    // the doc carries the dragged position with no pointer release
    expect(docPosition(local, "a")).toEqual([111, 111]);

    // and the flush echoing back through the observers does not snap the note:
    // the projection's dirty-guard skips geometry fields on a dirty note
    expect(projectionNote("a")!.position).toEqual([111, 111]);
  });

  test("a board with no presence stays doc-silent until commit", async () => {
    const { boardId, local } = freshBoard();
    createStickyNote(boardId, makeNote("a", { position: [0, 0] }));

    moveStickyNote(boardId, "a", [111, 111]);
    await sleep(PAST_FLUSH_MS);

    // same sequence, same wait — the gate is what differs
    expect(docPosition(local, "a")).toEqual([0, 0]);
    expect(projectionNote("a")!.position).toEqual([111, 111]);

    commitStickies();
    expect(docPosition(local, "a")).toEqual([111, 111]);
  });
});
