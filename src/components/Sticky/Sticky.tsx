import { createMemo } from "solid-js";
import { StickyNote } from "~/stores/stickyStore";

import { StickyMarkdown } from "./StickyMarkdown/StickyMarkdown";
import { StickyColorInput } from "./StickyColorInput/StickyColorInput";
import { StickyResizeCorner } from "./StickyResizeCorner/StickyResizeCorner";

import { StickyDragHandle } from "./StickyDragHandle/StickyDragHandle";
import { StickyDeleteButton } from "./StickyDeleteButton/StickyDeleteButton";
import { theme } from "~/stores/themeStore";
import { editingStickyId, selectSticky, editSticky, exitEditing } from "~/stores/uiStore";
import { toneVar } from "~/utils/tones";

import "./sticky.scss";

type StickyProps = {
  index: number;
  seq: number;
  sticky: StickyNote;
  active: boolean;
  updateSticky: (update: Partial<StickyNote>) => void;
  moveSticky: (position: [number, number]) => void;
  resizeSticky: (dimensions: [number, number]) => void;
  commitSticky: () => void;
  deleteSticky: () => void;
};

/**
 * @note it's odd that we need the shouldDelete flag to prevent the sticky from lingering
 */
export const Sticky = (props: StickyProps) => {
  // Only one sticky edits at a time (global id) — robust against focus/blur.
  const editing = () => editingStickyId() === props.sticky.id;

  // Title is derived from the note's text (titles abolished), capped at 10 chars
  // and left-aligned so the center of the band stays clear (for thread anchors).
  const titleText = createMemo(() => {
    const tmp = document.createElement("div");
    tmp.innerHTML = props.sticky.content;
    const text = (tmp.textContent ?? "").replace(/\s+/g, " ").trim();
    const base = text || `Sticky ${props.seq}`;
    return base.length > 10 ? base.slice(0, 10).trimEnd() + "…" : base;
  });

  // for some reason the updated sticky lingers on
  let shouldDelete = false;

  // Curated tones are all light in light mode, all dark in dark mode, so the
  // per-sticky ink contrast follows the global chrome theme.
  const stickyClass = () => {
    const contrast = theme() === "dark" ? "dark" : "light";
    return `sticky ${contrast}${props.active ? " active" : ""}`;
  };

  const stickyStyleOverrides = () => ({
    top: `${props.sticky.position?.[0]}px`,
    left: `${props.sticky.position?.[1]}px`,
    width: `${props.sticky.dimensions?.[0]}px`,
    height: `${props.sticky.dimensions?.[1]}px`,
    ["background-color"]: toneVar(props.sticky.color),
    // NB: kebab-case — Solid's style object uses setProperty, so camelCase
    // `zIndex` is silently ignored (stacking now relies on this, not DOM order).
    ["z-index"]: `${props.index}`,
  });

  // Press selects/raises (cheap, no editor). A real tap (click) opens the
  // editor — clicks don't fire for a 2-finger pinch or a drag, so the iOS
  // keyboard only appears on an intentional tap.
  const onPointerDown = () => selectSticky(props.sticky.id);
  const onClick = () => editSticky(props.sticky.id);

  const onStickyDelete = () => {
    if (confirm("Are you sure you want to delete this sticky note?")) {
      shouldDelete = true;
      if (editingStickyId() === props.sticky.id) exitEditing();
      props.deleteSticky();
    }
  };

  return (
    <div
      class={stickyClass()}
      style={stickyStyleOverrides()}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <StickyDragHandle
        moveBy={([dTop, dLeft]) =>
          props.moveSticky([
            props.sticky.position[0] + dTop,
            props.sticky.position[1] + dLeft,
          ])
        }
        onDragEnd={() => props.commitSticky()}
      />

      <div class="sticky-title-bar">
        <span class="sticky-title-label">{titleText()}</span>
      </div>

      <StickyDeleteButton deleteSticky={onStickyDelete} />

      <StickyMarkdown
        sticky={props.sticky}
        editing={editing()}
        onExit={exitEditing}
        updateContent={(content) => props.updateSticky({ content })}
      />

      <StickyResizeCorner
        dimensions={props.sticky.dimensions}
        updateStickyDimensions={(dimensions) => props.resizeSticky(dimensions)}
        onResizeEnd={() => props.commitSticky()}
      />

      <StickyColorInput
        color={props.sticky.color}
        updateColor={(color) => props.updateSticky({ color })}
      />
    </div>
  );
};
