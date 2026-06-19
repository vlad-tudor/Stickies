import { createEffect, createSignal, For, Show } from "solid-js";
import { Copy } from "lucide-static";
import { StickyNote, addThread } from "~/stores/stickyStore";

import { StickyMarkdown } from "./StickyMarkdown/StickyMarkdown";
import { StickyImage } from "./StickyImage/StickyImage";
import { StickyTableStrip } from "./StickyTableStrip/StickyTableStrip";
import { StickyColorInput } from "./StickyColorInput/StickyColorInput";
import { StickyResizeHandle, RESIZE_DIRS, CornerGrip } from "./StickyResize/StickyResizeHandle";

import { StickyDragHandle } from "./StickyDragHandle/StickyDragHandle";
import { StickyDeleteButton } from "./StickyDeleteButton/StickyDeleteButton";
import { theme } from "~/stores/themeStore";
import {
  editingStickyId,
  selectSticky,
  editSticky,
  exitEditing,
  setPendingThread,
} from "~/stores/uiStore";
import { useViewport } from "~/stores/viewportStore";
import { usePane } from "~/stores/paneContext";
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
  duplicateSticky: () => void;
};

/**
 * @note it's odd that we need the shouldDelete flag to prevent the sticky from lingering
 */
export const Sticky = (props: StickyProps) => {
  const vp = useViewport();
  const pane = usePane();
  // Only one sticky edits at a time (global id) — robust against focus/blur. Gated
  // to the FOCUSED pane so a cross-viewed note edits in one pane while the others
  // show the live-updating rendered view (instead of a second, stale editor).
  const editing = () => editingStickyId() === props.sticky.id && pane.focused();

  // Title is derived from the note's text (titles abolished), capped at 10 chars
  // and left-aligned so the center of the band stays clear (for thread anchors).
  // Derived on focus-loss, NOT per keystroke: the effect bails while editing, so
  // it doesn't track `content` and the title only refreshes when editing ends.
  const [title, setTitle] = createSignal("");
  createEffect(() => {
    if (editing()) return; // frozen while typing
    const tmp = document.createElement("div");
    tmp.innerHTML = props.sticky.content;
    const text = (tmp.textContent ?? "").replace(/\s+/g, " ").trim();
    const base = text || `Sticky ${props.seq}`;
    setTitle(base.length > 10 ? base.slice(0, 10).trimEnd() + "…" : base);
  });

  // Duplicate this note beside itself (offset, top of z-order, no connections).
  const onDuplicate = (e: MouseEvent) => {
    e.stopPropagation(); // don't enter edit / drag
    props.duplicateSticky();
  };

  // for some reason the updated sticky lingers on
  let shouldDelete = false;

  // Curated tones are all light in light mode, all dark in dark mode, so the
  // per-sticky ink contrast follows the global chrome theme.
  const stickyClass = () => {
    const contrast = theme() === "dark" ? "dark" : "light";
    return `sticky ${contrast}${props.active ? " active" : ""}${props.sticky.image ? " is-image" : ""}`;
  };

  const stickyStyleOverrides = () => ({
    top: `${props.sticky.position?.[0]}px`,
    left: `${props.sticky.position?.[1]}px`,
    width: `${props.sticky.dimensions?.[0]}px`,
    height: `${props.sticky.dimensions?.[1]}px`,
    ["background-color"]: toneVar(props.sticky.color),
    ["--note-bg"]: toneVar(props.sticky.color), // resize pills match the note's paper
    // NB: kebab-case — Solid's style object uses setProperty, so camelCase
    // `zIndex` is silently ignored (stacking relies on this, not DOM order).
    // Notes are >= 0; finished threads sit behind at z -1, grid at -2.
    ["z-index"]: `${props.index}`,
  });

  // Press selects/raises (cheap, no editor). A real tap (click) opens the
  // editor — clicks don't fire for a 2-finger pinch or a drag, so the iOS
  // keyboard only appears on an intentional tap.
  const onPointerDown = () => selectSticky(props.sticky.id);
  const onClick = () => {
    if (!props.sticky.image) editSticky(props.sticky.id); // image notes have no editor
  };

  // Drag the band's connect node onto another note to link them.
  const startConnect = (e: PointerEvent) => {
    e.stopPropagation(); // don't select/drag/edit the source note
    e.preventDefault();
    const node = e.currentTarget as HTMLElement;
    node.setPointerCapture(e.pointerId);

    const track = (ev: PointerEvent) =>
      setPendingThread({ from: props.sticky.id, to: vp.eventToWorld({ x: ev.clientX, y: ev.clientY }) });
    track(e);

    const onMove = (ev: PointerEvent) => track(ev);
    const onUp = (ev: PointerEvent) => {
      node.releasePointerCapture(ev.pointerId);
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerup", onUp);
      const target = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest<HTMLElement>("[data-sticky-id]")?.dataset.stickyId;
      if (target && target !== props.sticky.id) addThread(props.sticky.id, target);
      setPendingThread(null);
    };
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerup", onUp);
  };

  const onStickyDelete = () => {
    if (confirm("Are you sure you want to delete this sticky note?")) {
      shouldDelete = true;
      if (editingStickyId() === props.sticky.id) exitEditing();
      props.deleteSticky();
    }
  };

  return (
    <div
      data-sticky-id={props.sticky.id}
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

      <button
        class="sticky-connect"
        title="Drag to link to another note"
        onPointerDown={startConnect}
        onClick={(e) => e.stopPropagation()}
      />

      <div class="sticky-title-bar">
        <span class="sticky-title-label">{title()}</span>
      </div>

      <button
        class="sticky-copy-button"
        title="Duplicate note"
        onClick={onDuplicate}
        innerHTML={Copy}
      />

      <StickyDeleteButton deleteSticky={onStickyDelete} />

      <Show
        when={props.sticky.image}
        fallback={
          <>
            <StickyTableStrip stickyId={props.sticky.id} />
            <StickyMarkdown
              sticky={props.sticky}
              editing={editing()}
              onExit={exitEditing}
              updateContent={(content) => props.updateSticky({ content })}
            />
          </>
        }
      >
        <StickyImage image={props.sticky.image!} />
      </Show>

      <For each={RESIZE_DIRS}>
        {(dir) => (
          <StickyResizeHandle
            dir={dir}
            position={props.sticky.position}
            dimensions={props.sticky.dimensions}
            moveSticky={(position) => props.moveSticky(position)}
            resizeSticky={(dimensions) => props.resizeSticky(dimensions)}
            onResizeEnd={() => props.commitSticky()}
          />
        )}
      </For>
      <CornerGrip corner="se" />
      <CornerGrip corner="sw" />
      <CornerGrip corner="nw" />

      <StickyColorInput
        color={props.sticky.color}
        updateColor={(color) => props.updateSticky({ color })}
      />
    </div>
  );
};
