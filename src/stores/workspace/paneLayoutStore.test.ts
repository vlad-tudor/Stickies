// Pane layout state ops: bootstrap/restore, split/close/focus, board rebinding,
// tab-drop, and divider resize. Pure tree math is covered in domain/layout.test.
import { test, expect, describe } from "bun:test";
import {
  panes,
  layout,
  focusedPaneId,
  ensurePanes,
  resetPaneLayout,
  reconcilePanes,
  focusPane,
  showBoardInFocusedPane,
  splitPane,
  closePane,
  resizeSplit,
  dropBoardIntoPane,
  computeLayout,
  SplitDir,
  Zone,
  type SplitNode,
} from "./paneLayoutStore";
import { loadBoards, createBoard, deleteBoard, activeBoardId } from "~/stores/stickyStore";

// Fresh single board + single pane; returns [boardId, paneId].
const fresh = (): [string, string] => {
  localStorage.clear();
  window.location.hash = "";
  resetPaneLayout();
  loadBoards();
  ensurePanes();
  return [activeBoardId(), focusedPaneId()];
};

// The root as a split node (throws loudly in a test if it isn't one).
const rootSplit = (): SplitNode => {
  const root = layout();
  if (!root || root.type !== "split") throw new Error("expected a split root");
  return root;
};

describe("bootstrap", () => {
  test("ensurePanes creates one focused pane on the active board", () => {
    const [boardId, paneId] = fresh();
    expect(panes.length).toBe(1);
    expect(panes[0].boardId).toBe(boardId);
    expect(focusedPaneId()).toBe(paneId);
    expect(layout()).toEqual({ type: "leaf", paneId });
  });

  test("ensurePanes is idempotent", () => {
    fresh();
    ensurePanes();
    expect(panes.length).toBe(1);
  });
});

describe("split / close / focus", () => {
  test("splitPane adds a sibling on the same board and focuses it", () => {
    const [boardId, paneId] = fresh();
    splitPane(paneId, SplitDir.Row);
    expect(panes.length).toBe(2);
    expect(panes[1].boardId).toBe(boardId);
    expect(focusedPaneId()).toBe(panes[1].id);
    const root = rootSplit();
    expect(root.dir).toBe(SplitDir.Row);
    expect(root.children.length).toBe(2);
  });

  test("closePane collapses back to a single leaf and refocuses a survivor", () => {
    const [, paneId] = fresh();
    splitPane(paneId, SplitDir.Col);
    const opened = focusedPaneId();
    closePane(opened);
    expect(panes.length).toBe(1);
    expect(layout()).toEqual({ type: "leaf", paneId });
    expect(focusedPaneId()).toBe(paneId);
  });

  test("the last pane cannot be closed", () => {
    const [, paneId] = fresh();
    closePane(paneId);
    expect(panes.length).toBe(1);
  });

  test("focusPane mirrors the pane's board to the active board", () => {
    const [firstBoard, paneId] = fresh();
    splitPane(paneId, SplitDir.Row);
    const secondBoard = createBoard(); // activates it
    showBoardInFocusedPane(secondBoard);
    expect(panes[1].boardId).toBe(secondBoard);

    focusPane(paneId);
    expect(activeBoardId()).toBe(firstBoard);
    focusPane(panes[1].id);
    expect(activeBoardId()).toBe(secondBoard);
  });
});

describe("reconcilePanes", () => {
  test("rebinds panes whose board was deleted", () => {
    const [firstBoard, paneId] = fresh();
    splitPane(paneId, SplitDir.Row);
    const secondBoard = createBoard();
    showBoardInFocusedPane(secondBoard); // second pane shows the new board

    deleteBoard(secondBoard);
    reconcilePanes();
    expect(panes.every((pane) => pane.boardId === firstBoard)).toBe(true);
    expect(activeBoardId()).toBe(firstBoard);
  });

  test("drops the whole layout when no boards remain", () => {
    const [boardId] = fresh();
    deleteBoard(boardId);
    reconcilePanes();
    expect(panes.length).toBe(0);
    expect(layout()).toBeNull();
    expect(focusedPaneId()).toBe("");
  });
});

describe("dropBoardIntoPane", () => {
  test("center drop shows the board in that pane", () => {
    const [, paneId] = fresh();
    const dropped = createBoard();
    dropBoardIntoPane(paneId, Zone.Center, dropped);
    expect(panes[0].boardId).toBe(dropped);
    expect(focusedPaneId()).toBe(paneId);
    expect(activeBoardId()).toBe(dropped);
  });

  test("edge drop splits toward that edge with the new pane first", () => {
    const [, paneId] = fresh();
    const dropped = createBoard();
    dropBoardIntoPane(paneId, Zone.Left, dropped);
    expect(panes.length).toBe(2);
    const root = rootSplit();
    expect(root.dir).toBe(SplitDir.Row);
    // Zone.Left puts the new pane BEFORE the target
    const newPane = panes.find((pane) => pane.boardId === dropped)!;
    expect(root.children[0]).toEqual({ type: "leaf", paneId: newPane.id });
  });
});

describe("resizeSplit", () => {
  test("shifts weight between two children of a split", () => {
    const [, paneId] = fresh();
    splitPane(paneId, SplitDir.Row);
    const root = rootSplit();
    resizeSplit(root.id, 0, 3, 1);
    const { paneRects } = computeLayout(layout());
    expect(paneRects.get(paneId)?.w).toBeCloseTo(0.75);
    expect(paneRects.get(panes[1].id)?.w).toBeCloseTo(0.25);
  });
});

describe("restore from persistence", () => {
  test("a saved layout restores panes, tree, and focus; stale boards drop out", () => {
    // build a live board, then hand-craft a saved layout that references it
    // plus a board that no longer exists
    const [boardId] = fresh();
    localStorage.setItem(
      "stickies.layout",
      JSON.stringify({
        panes: [
          { id: "pane-7", boardId },
          { id: "pane-8", boardId: "gone-board" },
        ],
        layout: {
          type: "split",
          id: "split-9",
          dir: "row",
          children: [
            { type: "leaf", paneId: "pane-7" },
            { type: "leaf", paneId: "pane-8" },
          ],
          sizes: [1, 1],
        },
        focusedPaneId: "pane-8",
      }),
    );
    resetPaneLayout();
    ensurePanes();

    // the stale pane collapsed out of the tree; focus fell back to a live pane
    expect(panes.map((pane) => pane.id)).toEqual(["pane-7"]);
    expect(layout()).toEqual({ type: "leaf", paneId: "pane-7" });
    expect(focusedPaneId()).toBe("pane-7");

    // the id counter resumed above the restored ids — no collisions on split
    splitPane("pane-7", SplitDir.Row);
    const ids = panes.map((pane) => pane.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[1]).toBe("pane-10"); // counter resumed after split-9
  });

  test("a corrupt saved layout falls back to a fresh single pane", () => {
    const [boardId] = fresh();
    localStorage.setItem("stickies.layout", "{corrupt");
    resetPaneLayout();
    ensurePanes();
    expect(panes.length).toBe(1);
    expect(panes[0].boardId).toBe(boardId);
  });
});
