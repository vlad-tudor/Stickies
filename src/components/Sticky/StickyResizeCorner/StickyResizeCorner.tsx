import "./sticky-resize-corner.scss";

type StickyResizeCornerProps = {
  dimensions: [number, number];
  getStickySize: () => [number, number];
  updateStickyDimensions: (update: [number, number]) => void;
};

export const StickyResizeCorner = (props: StickyResizeCornerProps) => {
  let invisibleResizeElement!: HTMLDivElement;

  /** @note resize logic --  perhaps move to its own component/hook */
  let resizeOffset = [0, 0];

  const onStartResize = ({ dataTransfer, clientX, clientY }: DragEvent) => {
    // onStickyClick();
    dataTransfer?.setDragImage(invisibleResizeElement, 0, 0);
    // update the resizeOffset for during the resize
    resizeOffset = [clientX, clientY];
  };

  const onResize = ({ clientX, clientY }: MouseEvent) => {
    if (clientX === 0 && clientY === 0) {
      return;
    }

    const xLength = clientX - resizeOffset[0];
    const yLength = clientY - resizeOffset[1];

    const newDimensions: [number, number] = [
      props.dimensions[0] + xLength,
      props.dimensions[1] + yLength,
    ];

    props.updateStickyDimensions(newDimensions);
    resizeOffset = [clientX, clientY];
  };

  const onResizeEnd = () => {
    // let resizeOffset = [0, 0];
    // log out thea actual html element dimensions
    const stickySize = props.getStickySize();
    props.updateStickyDimensions(stickySize);
    // console.log("stickySize", stickySize);
  };
  return (
    <>
      <div class="invisible-resize-element" ref={invisibleResizeElement}>
        &nbsp;
      </div>

      <div
        class="sticky-expand-square"
        draggable="true"
        onDragStart={onStartResize}
        onDrag={onResize}
        onDragEnd={onResizeEnd}
      ></div>
    </>
  );
};
