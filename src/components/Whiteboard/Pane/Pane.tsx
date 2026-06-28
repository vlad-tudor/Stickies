import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { BoardTabs } from "../../BoardTabs/BoardTabs";
import { WhiteboardActions } from "../WhiteboardActions/WhiteboardActions";
import { RenderStickies } from "../RenderStickies";
import { RenderThreads } from "../RenderThreads";
import { ThreadPopover } from "../ThreadPopover";
import { OffscreenIndicators } from "../OffscreenIndicators";
import { BoardRulers } from "../BoardRulers/BoardRulers";
import { updateBoardBgColor } from "~/stores/stickyStore";
import { exitEditing, setSelectedThread, beginInteraction, endInteraction } from "~/stores/uiStore";
import {
  createViewport,
  ViewportProvider,
  registerViewport,
  unregisterViewport,
} from "~/stores/viewportStore";
import { createPane, PaneProvider } from "~/stores/paneContext";
import {
  showBoardInFocusedPane,
  boardDrag,
  stickyDrag,
  type Rect,
} from "~/stores/paneLayoutStore";
import { toneVar } from "~/utils/tones";

type PaneProps = {
  paneId: string;
  boardId: string;
  rect: Rect; // fraction of the pane-row this pane occupies (from the split tree)
  focused: boolean;
  onFocus: () => void;
  onSplit: () => void;
  onSplitDown: () => void;
  onClose: () => void;
  closable: boolean;
};

// One board surface: owns its viewport (pan/zoom), renders its board (by id) + the
// board chrome, and handles board gestures. The split-view shell renders several
// side by side.
export const Pane = (props: PaneProps) => {
  let boardRef!: HTMLDivElement;

  // The pane's screen top-left, so the viewport can map pointer events into this
  // pane even when it's offset (split-view). boardRef is set by render time.
  const origin = () => {
    const r = boardRef?.getBoundingClientRect();
    return r ? { x: r.left, y: r.top } : { x: 0, y: 0 };
  };
  const vp = createViewport(`stickies.view.${props.paneId}`, origin);
  const pane = createPane(() => props.boardId, () => props.focused);

  // Pane size (its own rect) — drives off-screen indicator + ruler math. Measured
  // so it's correct once panes no longer fill the window.
  const [size, setSize] = createSignal({ w: window.innerWidth, h: window.innerHeight });

  onMount(() => {
    const measure = () => {
      const r = boardRef.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(boardRef);
    window.addEventListener("resize", measure);

    // Focus this pane on any pointerdown within it — in the CAPTURE phase so it runs
    // BEFORE a note's own pointerdown, ensuring selection/mutations land on this
    // pane's board (the focused pane is the active board).
    const focus = () => props.onFocus();
    boardRef.addEventListener("pointerdown", focus, true);

    // expose this pane's viewport so a cross-pane sticky drop can map into it
    registerViewport(props.paneId, vp);

    onCleanup(() => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      boardRef.removeEventListener("pointerdown", focus, true);
      unregisterViewport(props.paneId);
    });
  });

  // Board gestures. We track EVERY pointer that reaches the board (incl. ones that
  // started on a note), so a 2nd finger anywhere becomes a board pinch — it "passes
  // through" the note rather than editing it. 1 finger only pans when it started on
  // the bare board; otherwise the note handles it.
  type P = { x: number; y: number; onBoard: boolean };
  const pointers = new Map<number, P>();
  let gestureMid: { x: number; y: number } | null = null;
  let gestureDist = 0;
  let panning = false; // true while a pan/pinch is actually moving (overlays go cheap)
  const ensurePanning = () => {
    if (!panning) {
      panning = true;
      beginInteraction();
    }
  };

  const mid = (a: P, b: P) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const dist = (a: P, b: P) => Math.hypot(b.x - a.x, b.y - a.y);

  const resetGesture = () => {
    const pts = [...pointers.values()];
    if (pts.length >= 2) {
      gestureMid = mid(pts[0], pts[1]);
      gestureDist = dist(pts[0], pts[1]);
    } else if (pts.length === 1) {
      gestureMid = { x: pts[0].x, y: pts[0].y };
      gestureDist = 0;
    } else {
      gestureMid = null;
      gestureDist = 0;
    }
  };

  const onBoardPointerDown = (e: PointerEvent) => {
    const onBoard = e.target === e.currentTarget;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, onBoard });
    if (onBoard) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      exitEditing(); // bare-board press closes any editor
      setSelectedThread(null); // ...and dismisses the thread popover
    }
    if (pointers.size >= 2) {
      vp.setIsPinching(true); // 2 fingers => board pinch, even over a note
      exitEditing();
    }
    resetGesture();
  };

  const onBoardPointerMove = (e: PointerEvent) => {
    const rec = pointers.get(e.pointerId);
    if (!rec) return;
    rec.x = e.clientX;
    rec.y = e.clientY;
    const pts = [...pointers.values()];
    if (pts.length >= 2 && gestureMid) {
      ensurePanning();
      const m = mid(pts[0], pts[1]);
      const d = dist(pts[0], pts[1]);
      vp.panBy(m.x - gestureMid.x, m.y - gestureMid.y); // follow the two fingers
      if (gestureDist > 0) {
        const rect = boardRef.getBoundingClientRect();
        vp.zoomAt(d / gestureDist, m.x - rect.left, m.y - rect.top); // pinch scale
      }
      gestureMid = m;
      gestureDist = d;
    } else if (pts.length === 1 && pts[0].onBoard && gestureMid) {
      ensurePanning();
      vp.panBy(e.clientX - gestureMid.x, e.clientY - gestureMid.y);
      gestureMid = { x: e.clientX, y: e.clientY };
    }
  };

  const onBoardPointerUp = (e: PointerEvent) => {
    const rec = pointers.get(e.pointerId);
    if (!rec) return;
    if (rec.onBoard) (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) vp.setIsPinching(false);
    if (pointers.size === 0 && panning) {
      panning = false;
      endInteraction();
    }
    resetGesture(); // 2->1 resumes pan from the remaining finger; 1->0 clears
  };

  const onWheel = (e: WheelEvent) => {
    // let a note scroll its own content unless zooming explicitly (ctrl/⌘)
    if (!e.ctrlKey && !e.metaKey && (e.target as HTMLElement).closest(".sticky")) return;
    e.preventDefault();
    const rect = boardRef.getBoundingClientRect();
    vp.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
  };

  const zoomCentered = (factor: number) => {
    const rect = boardRef.getBoundingClientRect();
    vp.zoomAt(factor, rect.width / 2, rect.height / 2);
  };

  const fitAll = () => {
    const rects = pane.stickies().map((s) => ({
      x: s.position[1],
      y: s.position[0],
      w: s.dimensions[0],
      h: s.dimensions[1],
    }));
    vp.fitView(rects, size());
  };

  // a cross-pane sticky drag is hovering this pane and would land on a DIFFERENT
  // board → highlight it as the drop target
  const isDropTarget = () => {
    const d = stickyDrag();
    return !!d && d.targetPaneId === props.paneId && d.fromBoardId !== props.boardId;
  };

  // grid + stickies share the viewport transform, so the board only needs the base
  // paper fill here. The pane is absolutely positioned to its rect (split-tree %).
  const boardStyle = () => ({
    "background-color": toneVar(pane.bgColor()),
    left: `${props.rect.x * 100}%`,
    top: `${props.rect.y * 100}%`,
    width: `${props.rect.w * 100}%`,
    height: `${props.rect.h * 100}%`,
  });

  return (
    <ViewportProvider value={vp}>
      <PaneProvider value={pane}>
        <div
          ref={boardRef}
          data-pane-id={props.paneId}
          class={`whiteboard${props.focused ? " is-focused" : ""}${isDropTarget() ? " drop-target" : ""}`}
          style={boardStyle()}
          onPointerDown={onBoardPointerDown}
          onPointerMove={onBoardPointerMove}
          onPointerUp={onBoardPointerUp}
          onPointerCancel={onBoardPointerUp}
          onWheel={onWheel}
        >
          <BoardTabs boardId={props.boardId} onSelect={showBoardInFocusedPane} />
          <WhiteboardActions
            bgColor={pane.bgColor()}
            updateBgColor={updateBoardBgColor}
            zoom={vp.zoom()}
            onZoomIn={() => zoomCentered(1.2)}
            onZoomOut={() => zoomCentered(1 / 1.2)}
            onZoomReset={vp.resetView}
            onFit={fitAll}
            onSplit={props.onSplit}
            onSplitDown={props.onSplitDown}
            onClose={props.onClose}
            closable={props.closable}
          />

          <div
            class="board-viewport"
            style={{ transform: `translate(${vp.pan().x}px, ${vp.pan().y}px) scale(${vp.zoom()})` }}
          >
            <div class="board-grid" />
            <RenderStickies />
            <RenderThreads />
          </div>

          <OffscreenIndicators size={size} />
          <BoardRulers size={size} />
          <ThreadPopover />

          <Show when={boardDrag()}> {/* board drag-to-split drop layer (pointer-driven) */}
            <div class="pane-drop-layer" data-pane-id={props.paneId}>
              <Show when={boardDrag()?.overPaneId === props.paneId && boardDrag()?.zone}>
                {(zone) => <div class={`pane-drop-zone zone-${zone()}`} />}
              </Show>
            </div>
          </Show>
        </div>
      </PaneProvider>
    </ViewportProvider>
  );
};
