import { createSignal, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { withMarkdown } from "../Markdown/Markdown";

import "./whiteboard.scss";
import "./sticky.scss";

type StickyNote = {
  id: string;
  position: [number, number];
  dimensions: [number, number];
  content: string; // markdown
  color: string;
};

const [stickyNoteStore, setStickyNoteStore] = createStore<{
  stickies: StickyNote[];
}>({
  stickies: [
    {
      id: "1",
      position: [50, 50],
      dimensions: [300, 300],
      content: "",
      color: "#e3d46f",
    },
  ],
});

const updateStickyNote = (index: number, update: Partial<StickyNote>) => {
  setStickyNoteStore("stickies", index, { ...update });
};

// board where sticky notes are placed and moved around
// sticky notes are draggable and can be deleted, but that's a detail of the stickies.
export const Whiteboard = () => {
  return (
    <div class="whiteboard">
      <Sticky />
    </div>
  );
};

type StickyProps = {
  sticky: StickyNote;
  updateSticky: (update: Partial<StickyNote>) => void;
};

/**
 * @todo move state into store, and move store outside
 * @todo move sticky logic into its own component file/folder
 * @todo separate drag and resize logic for bespoke CSS reasons
 */
export const Sticky = ({}) => {
  // const [isDragging, setIsDragging] = createSignal(false);
  const [position, setPosition] = createSignal([50, 50]);
  const [dimensions, setDimensions] = createSignal([300, 300]);

  const stickyStyle = () => ({
    top: `${position()[0]}px`,
    left: `${position()[1]}px`,
    width: `${dimensions()[0]}px`,
    height: `${dimensions()[1]}px`,
  });

  let invisibleDragElement!: HTMLDivElement;
  let stickyNoteRef!: HTMLDivElement;
  let stickyNoteContentRef!: HTMLDivElement;

  let dragOffset = [0, 0];

  const onStickyDragStart = (e: DragEvent) => {
    e.dataTransfer?.setDragImage(invisibleDragElement, 0, 0);
    // get the mouse position relative to the element
    const rect = stickyNoteRef.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    dragOffset = [offsetX, offsetY];
  };

  const onStickyDrag = (e: DragEvent) => {
    if (e.clientX === 0 && e.clientY === 0) {
      return;
    }
    setPosition([e.clientY - dragOffset[1], e.clientX - dragOffset[0]]);
  };

  const onStickyDragEnd = (e: DragEvent) => {
    // setPosition([e.clientY - dragOffset[1], e.clientX - dragOffset[0]]);
    // save the element's position
  };

  let resizeOffset = [0, 0];
  const onStartResize = (e: DragEvent) => {
    e.dataTransfer?.setDragImage(invisibleDragElement, 0, 0);

    resizeOffset = [e.clientX, e.clientY];
  };

  const onResize = (e: MouseEvent) => {
    if (e.clientX === 0 && e.clientY === 0) {
      return;
    }

    const xLength = e.clientX - resizeOffset[0];
    const yLength = e.clientY - resizeOffset[1];

    setDimensions((dimensions: number[]) => [
      dimensions[0] + xLength,
      dimensions[1] + yLength,
    ]);
    resizeOffset = [e.clientX, e.clientY];
  };

  const onResizeEnd = (e: MouseEvent) => {
    setDimensions([stickyNoteRef.clientWidth, stickyNoteRef.clientHeight]);
  };

  onMount(() => {
    withMarkdown({
      rootElementRef: stickyNoteContentRef,
      onMarkdownUpdated: () => {},
    });
  });

  return (
    <div ref={stickyNoteRef} class="sticky" style={stickyStyle()}>
      {/* This element is used as a drag handle, to allow the usage of HTML drag API events w/o a ghost */}
      <div
        class="invisible-draggable-element"
        ref={invisibleDragElement}
        style={{ opacity: "0", height: "0.01rem" }}
      >
        &nbsp;
      </div>

      <div
        class="sticky-handle"
        draggable="true"
        onDragStart={onStickyDragStart}
        onDragEnd={onStickyDragEnd}
        onDrag={onStickyDrag}
      ></div>
      <div ref={stickyNoteContentRef} class="sticky-content"></div>
      <div
        class="sticky-expand-square"
        draggable="true"
        onDragStart={onStartResize}
        onDragEnd={onResizeEnd}
        onDrag={onResize}
      ></div>
    </div>
  );
};
