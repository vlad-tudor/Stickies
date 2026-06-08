import { useDrag } from "~/hooks/useDrag";
import { zoom, isPinching } from "~/stores/viewportStore";
import { MIN_STICKY_WIDTH, MIN_STICKY_HEIGHT } from "~/stores/stickyStore";
import "./sticky-resize-corner.scss";

type StickyResizeCornerProps = {
  dimensions: [number, number];
  updateStickyDimensions: (update: [number, number]) => void;
  onResizeEnd?: () => void;
};

export const StickyResizeCorner = (props: StickyResizeCornerProps) => {
  let resizeOffset = [0, 0];

  const drag = useDrag({
    cursor: "nwse-resize",
    onStart: (e) => {
      resizeOffset = [e.clientX, e.clientY];
    },
    onMove: (e) => {
      if (isPinching()) {
        resizeOffset = [e.clientX, e.clientY]; // keep ref current
        return; // a 2nd finger turned this into a board pinch
      }
      const z = zoom();
      const xDelta = (e.clientX - resizeOffset[0]) / z; // screen px -> world px
      const yDelta = (e.clientY - resizeOffset[1]) / z;
      props.updateStickyDimensions([
        Math.max(MIN_STICKY_WIDTH, props.dimensions[0] + xDelta),
        Math.max(MIN_STICKY_HEIGHT, props.dimensions[1] + yDelta),
      ]);
      resizeOffset = [e.clientX, e.clientY];
    },
    onEnd: () => props.onResizeEnd?.(),
  });

  return (
    <div class="sticky-resize-zone" onPointerDown={drag.onPointerDown}>
      <div class="sticky-resize-indicator" />
    </div>
  );
};
