import { For, onCleanup, onMount, Show } from "solid-js";
import { Pane } from "./Pane/Pane";
import { BoardTabs } from "../BoardTabs/BoardTabs";
import { activeBoard, createBoard, loadBoards } from "~/stores/stickyStore";
import {
  panes,
  focusedPaneId,
  focusPane,
  splitPane,
  closePane,
  resizePanes,
  ensurePanes,
} from "~/stores/paneLayoutStore";

import "./whiteboard.scss";

const MIN_PANE_PX = 260; // a pane can't be dragged narrower than this

// Layout shell: the global tabs + a resizable row of board panes.
export const Whiteboard = () => {
  let rowRef!: HTMLDivElement;

  onMount(() => {
    loadBoards();
    ensurePanes();

    // Two-finger gestures are board pinch — stop the browser from also scrolling
    // note content underneath. Non-passive so preventDefault takes effect; only
    // blocks on 2+ touches, so single-finger content scroll still works. Global.
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault();
    };
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    onCleanup(() => document.removeEventListener("touchmove", onTouchMove));
  });

  // Drag a divider: shift flex weight between the two panes it sits between, with a
  // min width per pane. Weights are resolution-independent (panes scale on resize).
  const startResize = (e: PointerEvent, index: number) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const rowW = rowRef.getBoundingClientRect().width;
    const startX = e.clientX;
    const startSizes = panes.map((p) => p.size);
    const totalW = startSizes.reduce((a, b) => a + b, 0);
    const pairTotal = startSizes[index] + startSizes[index + 1];
    const minW = (MIN_PANE_PX / rowW) * totalW;

    const onMove = (ev: PointerEvent) => {
      const dW = ((ev.clientX - startX) / rowW) * totalW;
      const a = Math.max(minW, Math.min(pairTotal - minW, startSizes[index] + dW));
      resizePanes(index, a, pairTotal - a);
    };
    const onUp = (ev: PointerEvent) => {
      el.releasePointerCapture(ev.pointerId);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

  return (
    <div class="whiteboard-container">
      <BoardTabs />
      <Show
        when={activeBoard()}
        fallback={
          <div class="board-empty">
            <button
              class="board-empty-create"
              onClick={() => {
                createBoard();
                ensurePanes();
              }}
            >
              Create board
            </button>
          </div>
        }
      >
        <div class="pane-row" ref={rowRef}>
          <For each={panes}>
            {(p, i) => (
              <>
                <Pane
                  paneId={p.id}
                  boardId={p.boardId}
                  size={p.size}
                  focused={focusedPaneId() === p.id}
                  onFocus={() => focusPane(p.id)}
                  onSplit={() => splitPane(p.id)}
                  onClose={() => closePane(p.id)}
                  closable={panes.length > 1}
                />
                <Show when={i() < panes.length - 1}>
                  <div class="pane-divider" onPointerDown={(e) => startResize(e, i())} />
                </Show>
              </>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};
