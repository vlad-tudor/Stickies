import { onMount } from "solid-js";

import { StickyMarkdown } from "./StickyMarkdown/StickyMarkdown";
import { StickyColorInput } from "./StickyColorInput/StickyColorInput";
import { StickyResizeCorner } from "./StickyResizeCorner/StickyResizeCorner";

import { StickyDragHandle } from "./StickyDragHandle/StickyDragHandle";
import { StickyDeleteButton } from "./StickyDeleteButton/StickyDeleteButton";

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
 * @note it's odd that we need the shouldDelete flag to prevent the sticky from lingering
 */
export const Sticky = (props: StickyProps) => {
  let stickyNoteRef!: HTMLDivElement;

  // for some reason the updated sticky lingers on
  let shouldDelete = false;

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

  const getStickySize = (): [number, number] => [
    stickyNoteRef.clientWidth,
    stickyNoteRef.clientHeight,
  ];

  const getStickyRect = () => stickyNoteRef.getBoundingClientRect();

  const onStickyClick = () => {
    if (!(props.active || !props.sticky || shouldDelete)) {
      props.updateSticky({});
    }
  };

  const onStickyDelete = () => {
    if (confirm("Are you sure you want to delete this sticky note?")) {
      shouldDelete = true;
      props.deleteSticky();
    }
  };

  onMount(() => {
    if (props.sticky) {
      onStickyClick();
    }
  });

  return (
    <div
      ref={stickyNoteRef}
      class="sticky"
      style={stickyStyle()}
      onClick={onStickyClick}
    >
      <StickyDragHandle
        updateStickyPosition={(position) => props.updateSticky({ position })}
        getStickyRect={getStickyRect}
      />

      <StickyDeleteButton deleteSticky={onStickyDelete} />

      <StickyMarkdown
        sticky={props.sticky}
        active={props.active}
        updateStickyMarkdown={(content) => props.updateSticky({ content })}
      />

      <StickyResizeCorner
        dimensions={props.sticky.dimensions}
        getStickySize={getStickySize}
        updateStickyDimensions={(dimensions) =>
          props.updateSticky({ dimensions })
        }
      />

      <StickyColorInput
        color={props.sticky.color}
        updateColor={(color) => props.updateSticky({ color })}
      />
    </div>
  );
};
