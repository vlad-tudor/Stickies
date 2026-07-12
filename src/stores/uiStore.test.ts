// Interaction-intent contract: selection/edit lifecycle (and its coupling to
// z-order), the balanced interaction counter, and the consume-once fresh set.
import { test, expect, describe } from "bun:test";
import {
  editingStickyId,
  selectSticky,
  editSticky,
  exitEditing,
  setSelectedThread,
  selectedThread,
  isInteracting,
  beginInteraction,
  endInteraction,
  markStickyFresh,
  takeStickyFresh,
} from "./uiStore";
import {
  loadBoards,
  activeBoardId,
  createStickyNote,
  stickies,
  type StickyNote,
} from "./stickyStore";

const makeNote = (id: string): Omit<StickyNote, "z"> => ({
  id,
  position: [0, 0],
  dimensions: [300, 320],
  content: "",
  color: "cream",
});

// fresh board with notes "a" and "b"; returns the board id
const freshNotes = (): string => {
  localStorage.clear();
  window.location.hash = "";
  loadBoards();
  const boardId = activeBoardId();
  createStickyNote(boardId, makeNote("a"));
  createStickyNote(boardId, makeNote("b"));
  exitEditing();
  return boardId;
};

const topNote = (): StickyNote =>
  stickies().reduce((top, sticky) => (sticky.z > top.z ? sticky : top));

describe("selection / editing intents", () => {
  test("selectSticky raises the note and dismisses the thread popover", () => {
    const boardId = freshNotes();
    setSelectedThread({ boardId, id: "t1", x: 0, y: 0 });
    selectSticky(boardId, "a");
    expect(topNote().id).toBe("a");
    expect(selectedThread()).toBeNull();
    expect(editingStickyId()).toBeNull(); // select alone never opens an editor
  });

  test("selecting another note closes the open editor; reselecting keeps it", () => {
    const boardId = freshNotes();
    editSticky(boardId, "a");
    expect(editingStickyId()).toBe("a");
    selectSticky(boardId, "a"); // press on the note being edited
    expect(editingStickyId()).toBe("a"); // still editing
    selectSticky(boardId, "b"); // press elsewhere
    expect(editingStickyId()).toBeNull();
  });

  test("editSticky raises and opens; exitEditing closes", () => {
    const boardId = freshNotes();
    editSticky(boardId, "a");
    expect(topNote().id).toBe("a");
    expect(editingStickyId()).toBe("a");
    exitEditing();
    expect(editingStickyId()).toBeNull();
  });
});

describe("interaction counter", () => {
  test("overlapping gestures balance", () => {
    expect(isInteracting()).toBe(false);
    beginInteraction();
    beginInteraction();
    expect(isInteracting()).toBe(true);
    endInteraction();
    expect(isInteracting()).toBe(true); // one gesture still live
    endInteraction();
    expect(isInteracting()).toBe(false);
  });

  test("never goes negative", () => {
    endInteraction();
    expect(isInteracting()).toBe(false);
    beginInteraction();
    expect(isInteracting()).toBe(true);
    endInteraction();
  });
});

describe("fresh-note set", () => {
  test("take consumes the flag exactly once", () => {
    markStickyFresh("n1");
    expect(takeStickyFresh("n1")).toBe(true);
    expect(takeStickyFresh("n1")).toBe(false); // second mount doesn't animate
    expect(takeStickyFresh("never-marked")).toBe(false); // loaded/imported notes
  });
});
