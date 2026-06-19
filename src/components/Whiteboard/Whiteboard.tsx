import { createMemo, For, onCleanup, onMount, Show } from "solid-js";
import { Pane } from "./Pane/Pane";
import { activeBoard, createBoard, loadBoards } from "~/stores/stickyStore";
import { beginInteraction, endInteraction } from "~/stores/uiStore";
import {
  panes,
  layout,
  focusedPaneId,
  focusPane,
  splitPane,
  closePane,
  resizeSplit,
  ensurePanes,
  computeLayout,
  findSplit,
  type Divider,
  type Rect,
} from "~/stores/paneLayoutStore";

import "./whiteboard.scss";

const MIN_PANE_PX = 240; // a pane can't be dragged narrower/shorter than this
const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };

// Layout shell: a row/col split tree of board panes. Panes render FLAT (keyed by
// id, so restructuring never remounts them) positioned to rects computed from the
// tree; dividers are derived from the tree too.
export const Whiteboard = () => {
  let rowRef!: HTMLDivElement;

  onMount(() => {
    loadBoards();
    ensurePanes();

    // Two-finger gestures are board pinch — stop the browser from also scrolling
    // note content underneath. Global (page-level).
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault();
    };
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    onCleanup(() => document.removeEventListener("touchmove", onTouchMove));
  });

  const computed = createMemo(() => computeLayout(layout()));
  const paneRect = (id: string): Rect => computed().paneRects.get(id) ?? FULL;

  // Drag a divider: shift weight between the two children of its split node. Listen
  // on window (not the element) so the drag survives the divider being re-created as
  // the layout recomputes each frame. Absolute-from-start math (no drift).
  const startResize = (e: PointerEvent, d: Divider) => {
    e.preventDefault();
    const node = findSplit(layout(), d.nodeId);
    if (!node) return;
    beginInteraction(); // overlays go cheap + pane relayout coalesced to a frame
    const rowRect = rowRef.getBoundingClientRect();
    const axisPx = (d.dir === "row" ? rowRect.width : rowRect.height) * d.span;
    const startSizes = [...node.sizes];
    const total = startSizes.reduce((a, b) => a + b, 0);
    const pairTotal = startSizes[d.index] + startSizes[d.index + 1];
    const minW = (MIN_PANE_PX / axisPx) * total;
    const startPos = d.dir === "row" ? e.clientX : e.clientY;

    // coalesce to one layout write per animation frame (relayout is the cost)
    let raf = 0;
    let pendingA: number | null = null;
    const apply = () => {
      raf = 0;
      if (pendingA != null) {
        resizeSplit(d.nodeId, d.index, pendingA, pairTotal - pendingA);
        pendingA = null;
      }
    };
    const onMove = (ev: PointerEvent) => {
      const cur = d.dir === "row" ? ev.clientX : ev.clientY;
      const dW = ((cur - startPos) / axisPx) * total;
      pendingA = Math.max(minW, Math.min(pairTotal - minW, startSizes[d.index] + dW));
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onUp = () => {
      if (raf) cancelAnimationFrame(raf);
      apply(); // final position
      endInteraction();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const dividerStyle = (d: Divider) =>
    d.dir === "row"
      ? { left: `calc(${d.pos * 100}% - 3px)`, top: `${d.start * 100}%`, height: `${d.length * 100}%`, width: "6px" }
      : { top: `calc(${d.pos * 100}% - 3px)`, left: `${d.start * 100}%`, width: `${d.length * 100}%`, height: "6px" };

  return (
    <div class="whiteboard-container">
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
            {(p) => (
              <Pane
                paneId={p.id}
                boardId={p.boardId}
                rect={paneRect(p.id)}
                focused={focusedPaneId() === p.id}
                onFocus={() => focusPane(p.id)}
                onSplit={() => splitPane(p.id, "row")}
                onClose={() => closePane(p.id)}
                closable={panes.length > 1}
              />
            )}
          </For>
          <For each={computed().dividers}>
            {(d) => (
              <div
                class={`pane-divider ${d.dir}`}
                style={dividerStyle(d)}
                onPointerDown={(e) => startResize(e, d)}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};
