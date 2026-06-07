import { onMount, Show } from "solid-js";
import { WhiteboardActions } from "./WhiteboardActions/WhiteboardActions";
import { RenderStickies } from "./RenderStickies";
import { BoardTabs } from "../BoardTabs/BoardTabs";
import {
  activeBoard,
  activeBgColor,
  updateBoardBgColor,
  createBoard,
  loadBoards,
} from "~/stores/stickyStore";
import { exitEditing } from "~/stores/uiStore";
import { toneVar } from "~/utils/tones";

import "./whiteboard.scss";

export const Whiteboard = () => {
  onMount(() => loadBoards());

  // Exit editing only when pressing the bare board surface itself. Identity
  // check (not closest('.sticky')): pressing a note's text swaps it to the
  // editor mid-dispatch, detaching the event target — closest() would then
  // wrongly return null and close the editor the instant it opened.
  const onBoardPointerDown = (e: PointerEvent) => {
    if (e.target === e.currentTarget) exitEditing();
  };

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
        <div
          class="whiteboard"
          style={{ "background-color": toneVar(activeBgColor()) }}
          onPointerDown={onBoardPointerDown}
        >
          <WhiteboardActions bgColor={activeBgColor()} updateBgColor={updateBoardBgColor} />
          <RenderStickies />
        </div>
      </Show>
    </div>
  );
};
