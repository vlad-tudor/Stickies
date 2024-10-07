import "./sticky-drag-handle.scss";

type StickyDragHandleProps = {
  updateStickyPosition: (position: [number, number]) => void;
  getStickyRect: () => DOMRect;
};

export const StickyDragHandle = (props: StickyDragHandleProps) => {
  let invisibleDragElement!: HTMLDivElement;

  /** @note drag logic --  perhaps move to its own component/hook */
  let dragOffset = [0, 0];

  const onStickyDragStart = ({ dataTransfer, clientX, clientY }: DragEvent) => {
    /** @note for some reason on safari you can't do these kinds of shenanigans. I wonder why */
    dataTransfer?.setDragImage(invisibleDragElement, 0, 0);

    // get the mouse position relative to the element
    const rect = props.getStickyRect();

    // update the dragOffset for during
    dragOffset = [clientX - rect.left, clientY - rect.top];
  };

  const onStickyDrag = ({ clientX, clientY }: DragEvent) => {
    if (clientX === 0 && clientY === 0) {
      return;
    }
    props.updateStickyPosition([
      clientY - dragOffset[1],
      clientX - dragOffset[0],
    ]);
  };

  return (
    <>
      <div class="invisible-draggable-element" ref={invisibleDragElement}>
        &nbsp;
      </div>

      {/* sticky note drag handle -- little dark bit at the top */}
      <div
        class="sticky-drag-handle"
        draggable="true"
        onDragStart={onStickyDragStart}
        onDrag={onStickyDrag}
      ></div>
    </>
  );
};
