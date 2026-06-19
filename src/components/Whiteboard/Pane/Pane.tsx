import { createSignal, onCleanup, onMount } from "solid-js";
import { WhiteboardActions } from "../WhiteboardActions/WhiteboardActions";
import { RenderStickies } from "../RenderStickies";
import { RenderThreads } from "../RenderThreads";
import { ThreadPopover } from "../ThreadPopover";
import { OffscreenIndicators } from "../OffscreenIndicators";
import { BoardRulers } from "../BoardRulers/BoardRulers";
import { updateBoardBgColor } from "~/stores/stickyStore";
import { exitEditing, setSelectedThread } from "~/stores/uiStore";
import { createViewport, ViewportProvider } from "~/stores/viewportStore";
import { createPane, PaneProvider } from "~/stores/paneContext";
import { toneVar } from "~/utils/tones";
import { Maximize } from "lucide-static";

type PaneProps = {
  boardId: string;
};

// One board surface: owns its viewport (pan/zoom), renders its board (by id) + the
// board chrome, and handles board gestures. One pane today; the split-view shell
// renders several side by side.
export const Pane = (props: PaneProps) => {
  let boardRef!: HTMLDivElement;

  const vp = createViewport();
  const pane = createPane(() => props.boardId);

  // Pane size — drives off-screen indicator + ruler math. Today the pane fills the
  // window (chrome bars are fixed overlays); split-view will measure the pane rect.
  const [size, setSize] = createSignal({ w: window.innerWidth, h: window.innerHeight });

  onMount(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    onCleanup(() => window.removeEventListener("resize", onResize));
  });

  // Board gestures. We track EVERY pointer that reaches the board (incl. ones that
  // started on a note), so a 2nd finger anywhere becomes a board pinch — it "passes
  // through" the note rather than editing it. 1 finger only pans when it started on
  // the bare board; otherwise the note handles it.
  type P = { x: number; y: number; onBoard: boolean };
  const pointers = new Map<number, P>();
  let gestureMid: { x: number; y: number } | null = null;
  let gestureDist = 0;

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

  // grid + stickies share the viewport transform, so the board only needs the
  // base paper fill here.
  const boardStyle = () => ({ "background-color": toneVar(pane.bgColor()) });

  return (
    <ViewportProvider value={vp}>
      <PaneProvider value={pane}>
        <div
          ref={boardRef}
          class="whiteboard"
          style={boardStyle()}
          onPointerDown={onBoardPointerDown}
          onPointerMove={onBoardPointerMove}
          onPointerUp={onBoardPointerUp}
          onPointerCancel={onBoardPointerUp}
          onWheel={onWheel}
        >
          <WhiteboardActions bgColor={pane.bgColor()} updateBgColor={updateBoardBgColor} />

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

          <div class="board-zoom">
            <button class="board-zoom-fit" title="Fit all notes" onClick={fitAll} innerHTML={Maximize} />
            <button title="Zoom out" onClick={() => zoomCentered(1 / 1.2)}>−</button>
            <button class="board-zoom-reset" title="Reset view" onClick={vp.resetView}>
              {Math.round(vp.zoom() * 100)}%
            </button>
            <button title="Zoom in" onClick={() => zoomCentered(1.2)}>+</button>
          </div>
        </div>
      </PaneProvider>
    </ViewportProvider>
  );
};
