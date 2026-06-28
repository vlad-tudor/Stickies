import { createEffect, createMemo, For, onCleanup, onMount, Show } from "solid-js";
import { Copy } from "lucide-static";
import { Pane } from "./Pane/Pane";
import { StickyMarkdown } from "../Sticky/StickyMarkdown/StickyMarkdown";
import { StickyImage } from "../Sticky/StickyImage/StickyImage";
import { StickyDeleteButton } from "../Sticky/StickyDeleteButton/StickyDeleteButton";
import { StickyColorInput } from "../Sticky/StickyColorInput/StickyColorInput";
import { activeBoard, boards, createBoard, loadBoards } from "~/stores/stickyStore";
import { beginInteraction, endInteraction } from "~/stores/uiStore";
import { theme } from "~/stores/themeStore";
import { getViewport } from "~/stores/viewportStore";
import {
  panes,
  layout,
  focusedPaneId,
  focusPane,
  splitPane,
  closePane,
  resizeSplit,
  ensurePanes,
  reconcilePanes,
  computeLayout,
  findSplit,
  stickyDrag,
  type Divider,
  type Rect,
} from "~/stores/paneLayoutStore";
import { toneVar } from "~/utils/tones";

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

  // Whenever the board list changes (esp. a deletion), rebind any pane left pointing
  // at a board that no longer exists — even if it was deleted from another pane.
  createEffect(() => {
    boards().map((b) => b.id); // track the live board ids
    reconcilePanes();
  });

  const computed = createMemo(() => computeLayout(layout()));
  const paneRect = (id: string): Rect => computed().paneRects.get(id) ?? FULL;

  // floating ghost for a cross-pane sticky drag — shown only while the cursor is
  // over a pane on a DIFFERENT board (the source note clips at its own pane's edge).
  const crossGhost = createMemo(() => {
    const d = stickyDrag();
    if (!d || !d.targetPaneId) return null;
    const target = panes.find((p) => p.id === d.targetPaneId);
    return target && target.boardId !== d.fromBoardId ? d : null;
  });

  // The cross-board ghost renders the REAL source note (same `.sticky` markup + content),
  // so it looks exactly like the note. Scaled to the TARGET pane's zoom so it previews how
  // it will sit once dropped there.
  const ghostSticky = createMemo(() => {
    const d = crossGhost();
    if (!d) return null;
    const b = boards().find((x) => x.id === d.fromBoardId);
    return b?.stickies.find((s) => s.id === d.stickyId) ?? null;
  });
  const ghostZoom = createMemo(() => {
    const d = crossGhost();
    return (d?.targetPaneId && getViewport(d.targetPaneId)?.zoom()) || 1;
  });
  const ghostContrast = () => (theme() === "dark" ? "dark" : "light");

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
                onSplitDown={() => splitPane(p.id, "col")}
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

      <Show when={crossGhost()}>
        {(g) => (
          <Show when={ghostSticky()}>
            {(s) => (
              <div
                class="sticky-drag-ghost"
                style={{
                  // hang from the grabbed point (scaled to the target zoom), not the centre
                  left: `${g().x - g().grabX * ghostZoom()}px`,
                  top: `${g().y - g().grabY * ghostZoom()}px`,
                  transform: `scale(${ghostZoom()})`,
                }}
              >
                {/* a faithful clone of the resting note — same classes, so identical paint */}
                <div
                  class={`sticky ${ghostContrast()}`}
                  style={{
                    width: `${s().dimensions[0]}px`,
                    height: `${s().dimensions[1]}px`,
                    "background-color": toneVar(s().color),
                    "--note-bg": toneVar(s().color),
                  }}
                >
                  {/* in-flow band: reserves the 2rem strip (so the text sits where the real
                      note's does) AND paints the tonal grip — same as StickyDragHandle */}
                  <div class="sticky-drag-handle" />
                  <button class="sticky-connect" tabindex={-1} />
                  <div class="sticky-title-bar">
                    <span class="sticky-title-label">{g().title}</span>
                  </div>
                  <StickyColorInput color={s().color} updateColor={() => {}} />
                  <button class="sticky-copy-button" tabindex={-1} innerHTML={Copy} />
                  <StickyDeleteButton deleteSticky={() => {}} />
                  <Show
                    when={s().image}
                    fallback={
                      <StickyMarkdown
                        sticky={s()}
                        editing={false}
                        onExit={() => {}}
                        updateContent={() => {}}
                      />
                    }
                  >
                    <StickyImage image={s().image!} />
                  </Show>
                </div>
              </div>
            )}
          </Show>
        )}
      </Show>
    </div>
  );
};
