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
import { pan, zoom, panBy, zoomAt, resetView } from "~/stores/viewportStore";
import { toneVar } from "~/utils/tones";

import "./whiteboard.scss";

export const Whiteboard = () => {
  onMount(() => loadBoards());

  let boardRef!: HTMLDivElement;

  // Pressing the bare board: exit any editor, then pan by pointer movement.
  const onBoardPointerDown = (e: PointerEvent) => {
    if (e.target !== e.currentTarget) return; // a sticky/child was pressed
    exitEditing();

    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    let last = [e.clientX, e.clientY];
    const onMove = (ev: PointerEvent) => {
      panBy(ev.clientX - last[0], ev.clientY - last[1]);
      last = [ev.clientX, ev.clientY];
    };
    const onUp = (ev: PointerEvent) => {
      el.releasePointerCapture(ev.pointerId);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

  const onWheel = (e: WheelEvent) => {
    // let a note scroll its own content unless zooming explicitly (ctrl/⌘)
    if (!e.ctrlKey && !e.metaKey && (e.target as HTMLElement).closest(".sticky")) return;
    e.preventDefault();
    const rect = boardRef.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
  };

  const zoomCentered = (factor: number) => {
    const rect = boardRef.getBoundingClientRect();
    zoomAt(factor, rect.width / 2, rect.height / 2);
  };

  // grid + stickies share the viewport transform, so the board only needs the
  // base paper fill here.
  const boardStyle = () => ({ "background-color": toneVar(activeBgColor()) });

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
          ref={boardRef}
          class="whiteboard"
          style={boardStyle()}
          onPointerDown={onBoardPointerDown}
          onWheel={onWheel}
        >
          <WhiteboardActions bgColor={activeBgColor()} updateBgColor={updateBoardBgColor} />

          <div
            class="board-viewport"
            style={{ transform: `translate(${pan().x}px, ${pan().y}px) scale(${zoom()})` }}
          >
            <div class="board-grid" />
            <RenderStickies />
          </div>

          <div class="board-zoom">
            <button title="Zoom out" onClick={() => zoomCentered(1 / 1.2)}>−</button>
            <button class="board-zoom-reset" title="Reset view" onClick={resetView}>
              {Math.round(zoom() * 100)}%
            </button>
            <button title="Zoom in" onClick={() => zoomCentered(1.2)}>+</button>
          </div>
        </div>
      </Show>
    </div>
  );
};
