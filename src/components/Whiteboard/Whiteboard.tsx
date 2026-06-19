import { onCleanup, onMount, Show } from "solid-js";
import { Pane } from "./Pane/Pane";
import { BoardTabs } from "../BoardTabs/BoardTabs";
import { activeBoard, activeBoardId, createBoard, loadBoards } from "~/stores/stickyStore";

import "./whiteboard.scss";

// Layout shell: the top tabs + the board pane(s). Today it renders one Pane for the
// active board; split-view (step B2) renders several in a resizable row.
export const Whiteboard = () => {
  onMount(() => {
    loadBoards();

    // Two-finger gestures are board pinch — stop the browser from also scrolling
    // note content underneath. Non-passive so preventDefault takes effect; only
    // blocks on 2+ touches, so single-finger content scroll still works. Global
    // (page-level), so it lives here, not per-pane.
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault();
    };
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    onCleanup(() => document.removeEventListener("touchmove", onTouchMove));
  });

  return (
    <div class="whiteboard-container">
      <BoardTabs />
      <Show
        when={activeBoard()}
        fallback={
          <div class="board-empty">
            <button class="board-empty-create" onClick={() => createBoard()}>
              Create board
            </button>
          </div>
        }
      >
        <Pane boardId={activeBoardId()} />
      </Show>
    </div>
  );
};
