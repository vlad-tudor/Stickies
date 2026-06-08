import { useDrag } from "~/hooks/useDrag";
import { zoom, isPinching } from "~/stores/viewportStore";
import "./sticky-drag-handle.scss";

type StickyDragHandleProps = {
  // world-space delta [topΔ, leftΔ] to add to the sticky's position
  moveBy: (delta: [number, number]) => void;
  onDragEnd?: () => void;
};

export const StickyDragHandle = (props: StickyDragHandleProps) => {
  let last = [0, 0];

  const drag = useDrag({
    cursor: "grabbing",
    onStart: (e) => {
      last = [e.clientX, e.clientY];
    },
    onMove: (e) => {
      if (isPinching()) {
        last = [e.clientX, e.clientY]; // keep ref current so resume doesn't jump
        return; // a 2nd finger turned this into a board pinch
      }
      const z = zoom();
      const dx = (e.clientX - last[0]) / z; // screen px -> world px
      const dy = (e.clientY - last[1]) / z;
      last = [e.clientX, e.clientY];
      props.moveBy([dy, dx]);
    },
    onEnd: () => props.onDragEnd?.(),
  });

  return <div class="sticky-drag-handle" onPointerDown={drag.onPointerDown} />;
};
