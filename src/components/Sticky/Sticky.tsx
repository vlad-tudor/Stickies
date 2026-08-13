import { createEffect, createSignal, For, onMount, Show } from "solid-js";
import { animate } from "animejs";
import { Copy } from "lucide-static";
import {
  StickyNote,
  addThread,
  remoteHoldOn,
  holdSticky,
  presenceClientId,
  noteHasBodyFragment,
  HoldKind,
} from "~/stores/stickyStore";
import { MOTION } from "~/utils/motion";

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
  selectedStickyId,
  clearStickySelection,
  selectSticky,
  editSticky,
  exitEditing,
  setPendingThread,
  takeStickyFresh,
} from "~/stores/uiStore";
import { useViewport } from "~/stores/workspace/viewportStore";
import { usePane } from "~/stores/workspace/paneContext";
import { startStickyDrag, updateStickyDrag, dropSticky } from "~/stores/workspace/paneLayoutStore";
import { confirmDialog } from "~/stores/dialogStore";
import { toneVar } from "~/utils/tones";

import "./sticky.scss";

// Rendered z while this client edits a note — far above any real note z, so
// remote raises/drags can't cover the open editor. Never written to the doc.
const EDITING_Z = 9999;

type StickyProps = {
  z: number;
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

export const Sticky = (props: StickyProps) => {
  const vp = useViewport();
  const pane = usePane();
  let rootEl!: HTMLDivElement;

  // Freshly-created notes (via the "+" — not loaded/imported) pop in on mount.
  onMount(() => {
    if (takeStickyFresh(props.sticky.id)) {
      animate(rootEl, {
        scale: [0.85, 1],
        opacity: [0, 1],
        duration: MOTION.enter,
        ease: "outBack",
      });
    }
  });
  // Only one sticky edits at a time (global id) — robust against focus/blur. Gated
  // to the FOCUSED pane so a cross-viewed note edits in one pane while the others
  // show the live-updating rendered view (instead of a second, stale editor).
  const editing = () => editingStickyId() === props.sticky.id && pane.focused();

  // A live-session peer's unexpired hold on this note (editing or moving it).
  const remoteHold = () => remoteHoldOn(pane.boardId(), props.sticky.id);

  // Edit-claim race on a LEGACY note (both opened before either claim or the
  // body fragment propagated): the LOWER awareness client id keeps the editor —
  // deterministic on both sides. Fragment-backed notes co-edit freely, so no
  // eviction applies there.
  createEffect(() => {
    const hold = remoteHold();
    if (!hold || !editing()) return;
    if (noteHasBodyFragment(pane.boardId(), props.sticky.id)) return;
    const ourClientId = presenceClientId(pane.boardId());
    if (ourClientId !== undefined && hold.clientId < ourClientId) exitEditing();
  });

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

  // Curated tones are all light in light mode, all dark in dark mode, so the
  // per-sticky ink contrast follows the global chrome theme (same values).
  const stickyClass = () => {
    return `sticky ${theme()}${props.active ? " active" : ""}${props.sticky.image ? " is-image" : ""}${remoteHold() ? " remote-held" : ""}`;
  };

  const stickyStyleOverrides = () => ({
    top: `${props.sticky.position[0]}px`,
    left: `${props.sticky.position[1]}px`,
    width: `${props.sticky.dimensions[0]}px`,
    height: `${props.sticky.dimensions[1]}px`,
    ["background-color"]: toneVar(props.sticky.color),
    ["--note-bg"]: toneVar(props.sticky.color), // resize pills match the note's paper
    // NB: kebab-case — Solid's style object uses setProperty, so camelCase
    // `zIndex` is silently ignored (stacking relies on this, not DOM order).
    // Notes are >= 0; finished threads sit behind at z -1, grid at -2.
    // While EDITING, boost the rendered z LOCALLY only — a peer's raise/drag
    // must not bury the note being typed in; the doc's z is untouched.
    ["z-index"]: editing() ? `${EDITING_Z}` : `${props.z}`,
    // the holder's identity tone drives the hold outline + chip
    ["--hold-tone"]: remoteHold() ? toneVar(remoteHold()!.color) : undefined,
  });

  // Press selects/raises (cheap, no editor). A real tap (click) opens the
  // editor — clicks don't fire for a 2-finger pinch or a drag, so the iOS
  // keyboard only appears on an intentional tap.
  const onPointerDown = () => selectSticky(pane.boardId(), props.sticky.id);
  const onClick = () => {
    if (!props.sticky.image) editSticky(pane.boardId(), props.sticky.id); // image notes have no editor
  };

  // Drag the band's connect node onto another note to link them.
  const startConnect = (e: PointerEvent) => {
    e.stopPropagation(); // don't select/drag/edit the source note
    e.preventDefault();
    const node = e.currentTarget as HTMLElement;
    node.setPointerCapture(e.pointerId);

    const track = (ev: PointerEvent) =>
      setPendingThread({
        from: props.sticky.id,
        to: vp.eventToWorld({ x: ev.clientX, y: ev.clientY }),
      });
    track(e);

    const onMove = (ev: PointerEvent) => track(ev);
    const onUp = (ev: PointerEvent) => {
      node.releasePointerCapture(ev.pointerId);
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerup", onUp);
      const target = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest<HTMLElement>("[data-sticky-id]")?.dataset.stickyId;
      if (target && target !== props.sticky.id) addThread(pane.boardId(), props.sticky.id, target);
      setPendingThread(null);
    };
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerup", onUp);
  };

  const onStickyDelete = async () => {
    if (
      !(await confirmDialog("Delete this sticky note?", {
        title: "Delete note",
        confirmText: "Delete",
        danger: true,
      }))
    )
      return;
    if (editingStickyId() === props.sticky.id) exitEditing();
    if (selectedStickyId() === props.sticky.id) clearStickySelection();
    // Animate OUT first, then remove from the store on complete — the node stays
    // mounted for the animation (no exit-timing infra needed).
    animate(rootEl, {
      scale: 0.85,
      opacity: 0,
      duration: MOTION.leave,
      ease: "inQuad",
      onComplete: () => props.deleteSticky(),
    });
  };

  return (
    <div
      ref={rootEl}
      data-sticky-id={props.sticky.id}
      class={stickyClass()}
      style={stickyStyleOverrides()}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <StickyDragHandle
        moveBy={([dTop, dLeft]) =>
          props.moveSticky([props.sticky.position[0] + dTop, props.sticky.position[1] + dLeft])
        }
        onDragStart={(e) => {
          // grab offset within the note (world units) → the ghost hangs from the
          // grabbed point (the band), mirroring the real drag
          const cw = vp.eventToWorld({ x: e.clientX, y: e.clientY });
          startStickyDrag({
            stickyId: props.sticky.id,
            fromBoardId: pane.boardId(),
            title: title(),
            color: props.sticky.color,
            x: e.clientX,
            y: e.clientY,
            grabX: cw.x - props.sticky.position[1],
            grabY: cw.y - props.sticky.position[0],
          });
        }}
        onDragMove={(e) => updateStickyDrag(e.clientX, e.clientY)}
        onDragEnd={() => {
          dropSticky(); // move to another board if dropped over a different pane
          props.commitSticky();
        }}
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

      <Show when={remoteHold()}>
        {(hold) => (
          <div class="sticky-remote-hold" style={{ "background-color": toneVar(hold().color) }}>
            {hold().name}
          </div>
        )}
      </Show>

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
              updateContent={(content) => {
                // each keystroke refreshes the editing lease (throttled inside)
                holdSticky(pane.boardId(), props.sticky.id, HoldKind.Editing);
                props.updateSticky({ content });
              }}
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
