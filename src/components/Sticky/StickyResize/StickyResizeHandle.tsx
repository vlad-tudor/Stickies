import { useDrag } from "~/hooks/useDrag";
import { useViewport } from "~/stores/viewportStore";
import { MIN_STICKY_WIDTH, MIN_STICKY_HEIGHT } from "~/stores/stickyStore";
import "./sticky-resize.scss";

export type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

// No "n": the top is the move band, so the sticky can't be resized from the top.
// No "ne": the delete button sits at the top-right, so no grip/handle there.
export const RESIZE_DIRS: ResizeDir[] = ["s", "e", "w", "nw", "sw", "se"];

const CURSOR: Record<ResizeDir, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

type StickyResizeHandleProps = {
  dir: ResizeDir;
  position: [number, number]; // [top, left]
  dimensions: [number, number]; // [w, h]
  moveSticky: (position: [number, number]) => void;
  resizeSticky: (dimensions: [number, number]) => void;
  onResizeEnd?: () => void;
};

// One resize handle. E/S edges grow dimensions only; W/N edges keep the OPPOSITE
// edge fixed, so they move the note's position as they resize — by the APPLIED
// delta (start − clamped) so the note doesn't drift once clamped at min size.
// All math is absolute from a start snapshot (no per-frame drift); deltas ÷ zoom.
export const StickyResizeHandle = (props: StickyResizeHandleProps) => {
  const vp = useViewport();
  const dir = props.dir;
  const north = dir.includes("n");
  const south = dir.includes("s");
  const east = dir.includes("e");
  const west = dir.includes("w");

  let s = { x: 0, y: 0, top: 0, left: 0, w: 0, h: 0 };
  const snapshot = (e: PointerEvent) => {
    s = {
      x: e.clientX,
      y: e.clientY,
      top: props.position[0],
      left: props.position[1],
      w: props.dimensions[0],
      h: props.dimensions[1],
    };
  };

  const drag = useDrag({
    cursor: CURSOR[dir],
    onStart: snapshot,
    onMove: (e) => {
      if (vp.isPinching()) {
        snapshot(e); // re-baseline so resuming after a board pinch doesn't jump
        return;
      }
      const z = vp.zoom();
      const dx = (e.clientX - s.x) / z;
      const dy = (e.clientY - s.y) / z;

      let w = s.w;
      let h = s.h;
      if (east) w = s.w + dx;
      if (west) w = s.w - dx;
      if (south) h = s.h + dy;
      if (north) h = s.h - dy;
      w = Math.max(MIN_STICKY_WIDTH, w);
      h = Math.max(MIN_STICKY_HEIGHT, h);

      props.resizeSticky([w, h]);
      if (north || west) {
        props.moveSticky([
          north ? s.top + (s.h - h) : s.top,
          west ? s.left + (s.w - w) : s.left,
        ]);
      }
    },
    onEnd: () => props.onResizeEnd?.(),
  });

  // edges get a paper "pill" grab-hint; corners get a bracket (see CornerGrip).
  const isEdge = dir.length === 1;

  return (
    <div class={`sticky-resize-handle rh-${dir}`} onPointerDown={drag.onPointerDown}>
      {isEdge && <span class="rh-pill" />}
    </div>
  );
};

// Corner resize grip — VISUAL only (pointer-events:none). Rendered as a sibling of
// the handles (not inside one) so it can paint ABOVE the band controls (z 6 > the
// delete button at z 5) while the hit handle stays below them; the corner handles
// straddle outward so their grab area clears those controls. A right-angle bracket
// (a horizontal + vertical pill fused at the corner — one stroked L with round
// caps) in the note's paper + border, with an inner └ mark. sw/nw = se mirrored.
export const CornerGrip = (props: { corner: "se" | "sw" | "nw" }) => (
  <svg class={`corner-grip cg-${props.corner}`} viewBox="0 0 36 36" aria-hidden="true">
    <path class="cg-border" d="M12 28 L28 28 L28 12" />
    <path class="cg-paper" d="M12 28 L28 28 L28 12" />
    <path class="cg-mark" d="M19 28 L28 28 L28 19" />
  </svg>
);
