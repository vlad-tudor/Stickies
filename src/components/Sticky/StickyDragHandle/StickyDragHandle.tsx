import { useDrag } from "~/hooks/useDrag";
import "./sticky-drag-handle.scss";

type StickyDragHandleProps = {
  updateStickyPosition: (position: [number, number]) => void;
  getStickyRect: () => DOMRect;
};

export const StickyDragHandle = (props: StickyDragHandleProps) => {
  let dragOffset = [0, 0];

  const drag = useDrag({
    onStart: (e) => {
      const rect = props.getStickyRect();
      dragOffset = [e.clientX - rect.left, e.clientY - rect.top];
    },
    onMove: (e) => {
      props.updateStickyPosition([
        e.clientY - dragOffset[1],
        e.clientX - dragOffset[0],
      ]);
    },
  });

  return (
    <>
      <div class="invisible-draggable-element" ref={drag.setInvisibleEl}>
        &nbsp;
      </div>
      <div
        class="sticky-drag-handle"
        draggable="true"
        onDragStart={drag.onDragStart}
        onDrag={drag.onDrag}
      />
    </>
  );
};
