import { useDrag } from "~/hooks/useDrag";
import "./sticky-resize-corner.scss";

type StickyResizeCornerProps = {
  dimensions: [number, number];
  getStickySize: () => [number, number];
  updateStickyDimensions: (update: [number, number]) => void;
};

export const StickyResizeCorner = (props: StickyResizeCornerProps) => {
  let resizeOffset = [0, 0];

  const drag = useDrag({
    onStart: (e) => {
      resizeOffset = [e.clientX, e.clientY];
    },
    onMove: (e) => {
      const xDelta = e.clientX - resizeOffset[0];
      const yDelta = e.clientY - resizeOffset[1];
      props.updateStickyDimensions([
        props.dimensions[0] + xDelta,
        props.dimensions[1] + yDelta,
      ]);
      resizeOffset = [e.clientX, e.clientY];
    },
    onEnd: () => {
      props.updateStickyDimensions(props.getStickySize());
    },
  });

  return (
    <>
      <div class="invisible-resize-element" ref={drag.setInvisibleEl}>
        &nbsp;
      </div>
      <div
        class="sticky-expand-square"
        draggable="true"
        onDragStart={drag.onDragStart}
        onDrag={drag.onDrag}
        onDragEnd={drag.onDragEnd}
      />
    </>
  );
};
