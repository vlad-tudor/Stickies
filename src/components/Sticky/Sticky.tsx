import { createSignal, onMount, Show } from "solid-js";
import { StickyNote } from "~/stores/stickyStore";

import { StickyMarkdown } from "./StickyMarkdown/StickyMarkdown";
import { StickyColorInput } from "./StickyColorInput/StickyColorInput";
import { StickyResizeCorner } from "./StickyResizeCorner/StickyResizeCorner";

import { StickyDragHandle } from "./StickyDragHandle/StickyDragHandle";
import { StickyDeleteButton } from "./StickyDeleteButton/StickyDeleteButton";
import { isLightBackground } from "~/utils/color";

import "./sticky.scss";

type StickyProps = {
  index: number;
  sticky: StickyNote;
  active: boolean;
  initialHtml?: string;
  updateSticky: (update: Partial<StickyNote>) => void;
  deleteSticky: () => void;
};

/**
 * @note it's odd that we need the shouldDelete flag to prevent the sticky from lingering
 */
export const Sticky = (props: StickyProps) => {
  let stickyNoteRef!: HTMLDivElement;
  let titleInputRef!: HTMLInputElement;
  const [rawMode, setRawMode] = createSignal(false);
  const [editingTitle, setEditingTitle] = createSignal(false);

  const displayTitle = () => props.sticky.title || `Sticky ${props.index + 1}`;

  // for some reason the updated sticky lingers on
  let shouldDelete = false;

  const stickyClass = () => {
    const theme = isLightBackground(props.sticky.color) ? "light" : "dark";
    return `sticky ${theme}${props.active ? " active" : ""}`;
  };

  const stickyStyleOverrides = () => ({
    top: `${props.sticky.position?.[0]}px`,
    left: `${props.sticky.position?.[1]}px`,
    width: `${props.sticky.dimensions?.[0]}px`,
    height: `${props.sticky.dimensions?.[1]}px`,
    ["background-color"]: props.sticky.color,
    zIndex: props.index,
  });

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
      class={stickyClass()}
      style={stickyStyleOverrides()}
      onClick={onStickyClick}
    >
      <StickyDragHandle
        updateStickyPosition={(position) => props.updateSticky({ position })}
        getStickyRect={getStickyRect}
      />

      <button
        class={`sticky-raw-toggle ${rawMode() ? "active" : ""}`}
        onClick={() => setRawMode(!rawMode())}
      >
        {"</>"}
      </button>

      <div class="sticky-title-bar">
        <Show when={editingTitle()} fallback={
          <>
            <span class="sticky-title-label">{displayTitle()}</span>
            <button
              class="sticky-title-edit"
              onClick={() => {
                setEditingTitle(true);
                requestAnimationFrame(() => titleInputRef?.focus());
              }}
            >
              ...
            </button>
          </>
        }>
          <input
            ref={titleInputRef}
            class="sticky-title-input"
            type="text"
            value={props.sticky.title ?? ""}
            placeholder={`Sticky ${props.index + 1}`}
            onInput={(e) => props.updateSticky({ title: e.currentTarget.value })}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => { if (e.key === "Enter") titleInputRef?.blur(); }}
          />
        </Show>
      </div>

      <StickyDeleteButton deleteSticky={onStickyDelete} />

      <StickyMarkdown
        sticky={props.sticky}
        active={props.active}
        rawMode={rawMode()}
        initialHtml={props.initialHtml}
        updateStickyMarkdown={(content) => props.updateSticky({ content })}
      />

      <StickyResizeCorner
        dimensions={props.sticky.dimensions}
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
