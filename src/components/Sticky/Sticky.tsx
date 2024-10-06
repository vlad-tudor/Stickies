import { createEffect, createSignal, onMount } from "solid-js";
import { MarkdownProps, withMarkdownRecurse } from "../Markdown/withMarkdown";

import { StickyMarkdown } from "./StickyMarkdown/StickyMarkdown";
import { StickyColorInput } from "./StickyColorInput/StickyColorInput";
import { StickyResizeCorner } from "./StickyResizeCorner/StickyResizeCorner";

import "./sticky.scss";
import { StickyDragHandle } from "./SticktyDragHandle/SticktyDragHandle";
import { StickyDeleteButton } from "./StickyDeleteButton/StickyDeleteButton";
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

  let stickyNoteRef!: HTMLDivElement;

  let shouldDelete = false;

  const onStickyClick = () => {
    if (!(props.active || !props.sticky || shouldDelete)) {
      props.updateSticky({});
    }
  };

  const getStickySize = (): [number, number] => [
    stickyNoteRef.clientWidth,
    stickyNoteRef.clientHeight,
  ];

  const getStickyRect = () => stickyNoteRef.getBoundingClientRect();

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
