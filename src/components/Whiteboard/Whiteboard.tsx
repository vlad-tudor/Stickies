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

  // clicking the bare board (not a sticky) exits any open editor
  const onBoardPointerDown = (e: PointerEvent) => {
    if (!(e.target as HTMLElement).closest(".sticky")) exitEditing();
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
