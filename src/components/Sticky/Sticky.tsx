import { onMount } from "solid-js";
import { MarkdownProps, withMarkdownRecurse } from "../Markdown/withMarkdown";

import "./sticky.scss";

type StickyNote = {
  id: string;
  position: [number, number];
  dimensions: [number, number];
  content: string; // markdown
  color: string;
};

type StickyProps = {
  index: number;
  sticky: StickyNote;
  active: boolean;
  updateSticky: (update: Partial<StickyNote>) => void;
  deleteSticky: () => void;
};

/**
 * NOTE: This has to be split up pronto, it's getting unmanageable
 */
export const Sticky = (props: StickyProps) => {
  const stickyStyle = () => ({
    top: `${props.sticky.position?.[0]}px`,
    left: `${props.sticky.position?.[1]}px`,
    width: `${props.sticky.dimensions?.[0]}px`,
    height: `${props.sticky.dimensions?.[1]}px`,
    ["background-color"]: props.sticky.color,
    border: props.active
      ? "2px solid rgba(0, 0, 0, 0.5)"
      : "2px solid rgba(0, 0, 0, 0.2)",
    zIndex: props.index,
  });

  let invisibleDragElement!: HTMLDivElement;
  let stickyNoteRef!: HTMLDivElement;
  let stickyNoteContentRef!: HTMLDivElement;

  /** @note drag logic --  perhaps move to its own component/hook */
  let dragOffset = [0, 0];

  const onStickyDragStart = ({ dataTransfer, clientX, clientY }: DragEvent) => {
    onStickyClick();
    dataTransfer?.setDragImage(invisibleDragElement, 0, 0);

    // get the mouse position relative to the element
    const rect = stickyNoteRef.getBoundingClientRect();

    // update the dragOffset for during
    dragOffset = [clientX - rect.left, clientY - rect.top];
  };

  const onStickyDrag = ({ clientX, clientY }: DragEvent) => {
    if (clientX === 0 && clientY === 0) {
      return;
    }
    props.updateSticky({
      position: [clientY - dragOffset[1], clientX - dragOffset[0]],
    });
  };

  /** @note resize logic --  perhaps move to its own component/hook */
  let resizeOffset = [0, 0];

  const onStartResize = ({ dataTransfer, clientX, clientY }: DragEvent) => {
    onStickyClick();
    dataTransfer?.setDragImage(invisibleDragElement, 0, 0);
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
      props.sticky.dimensions[0] + xLength,
      props.sticky.dimensions[1] + yLength,
    ];

    props.updateSticky({ dimensions: newDimensions });
    resizeOffset = [clientX, clientY];
  };

  const onResizeEnd = (e: MouseEvent) => {
    props.updateSticky({
      dimensions: [stickyNoteRef.clientWidth, stickyNoteRef.clientHeight],
    });
  };

  let starMarkdown = async (markdownProps: MarkdownProps) => {
    starMarkdown = await withMarkdownRecurse(markdownProps);
    return starMarkdown;
  };

  let shouldDelete = false;
  const onStickyClick = () => {
    if (props.active || !props.sticky || shouldDelete) {
      return;
    }

    stickyNoteContentRef.innerHTML = "";
    starMarkdown({
      rootElementRef: stickyNoteContentRef,
      previousMarkdown: props.sticky.content,
      onMarkdownUpdated: (content) => props.updateSticky({ content }),
    });

    props.updateSticky({});
  };

  const onStickyDelete = () => {
    if (confirm("Are you sure you want to delete this sticky note?")) {
      shouldDelete = true;
      props.deleteSticky();
    }
  };

  onMount(() => {
    if (!props.sticky) {
      return;
    }
    onStickyClick();
  });

  return (
    <div
      ref={stickyNoteRef}
      class="sticky"
      style={stickyStyle()}
      onClick={onStickyClick}
    >
      {/* This element is used as a drag handle, to allow the usage of HTML drag API events w/o a ghost */}
      <div
        class="invisible-draggable-element"
        ref={invisibleDragElement}
        style={{ opacity: "0", height: "0.01rem" }}
      >
        &nbsp;
      </div>

      {/* sticky note drag handle -- little dark bit at the top */}
      <div
        class="sticky-handle"
        draggable="true"
        onDragStart={onStickyDragStart}
        onDrag={onStickyDrag}
      >
        <div class="delete-sticky" onClick={onStickyDelete}>
          ✖️
        </div>
      </div>

      <div
        ref={stickyNoteContentRef}
        id={"sticky-content-" + props.sticky.id}
        class="sticky-content"
        style={{ "pointer-events": props.active ? "all" : "none" }}
      ></div>

      <div
        class="sticky-expand-square"
        draggable="true"
        onDragStart={onStartResize}
        onDragEnd={onResizeEnd}
        onDrag={onResize}
      ></div>

      <input
        type="color"
        class="sticky-color-picker"
        value={props.sticky.color}
        onInput={(e) => props.updateSticky({ color: e.currentTarget.value })}
      />
    </div>
  );
};
