import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { TONES, type Tone } from "~/utils/tones";

import "./tone-picker.scss";

type TonePickerProps = {
  value: Tone;
  onChange: (tone: Tone) => void;
  title?: string;
  direction?: "up" | "down"; // where the popover opens (default up)
  // Render the popover in a body Portal with fixed coords, so it escapes a scrolling /
  // clipping ancestor (the actions bar scrolls horizontally). Per-note pickers leave
  // this off and keep the plain absolute popover.
  portal?: boolean;
};

// A single current-color dot that opens a floating paper popover of the other tones.
// Shared by the per-note color and the board hue.
export const TonePicker = (props: TonePickerProps) => {
  const [open, setOpen] = createSignal(false);
  const [pos, setPos] = createSignal({ x: 0, y: 0 });
  let ref!: HTMLDivElement; // the trigger container
  let popRef: HTMLDivElement | undefined; // the popover (possibly portaled)

  const onDocDown = (e: PointerEvent) => {
    const t = e.target as Node;
    if (ref?.contains(t) || popRef?.contains(t)) return; // click inside trigger/popover
    setOpen(false);
  };

  createEffect(() => {
    if (open()) document.addEventListener("pointerdown", onDocDown, true);
    else document.removeEventListener("pointerdown", onDocDown, true);
  });
  onCleanup(() => document.removeEventListener("pointerdown", onDocDown, true));

  const dir = () => props.direction ?? "up";

  const toggle = () => {
    if (!open() && props.portal) {
      // anchor the fixed popover to the dot's current screen position
      const r = ref.getBoundingClientRect();
      setPos({ x: r.left + r.width / 2, y: dir() === "down" ? r.bottom + 6 : r.top - 6 });
    }
    setOpen((o) => !o);
  };

  const Options = () => (
    <For each={TONES.filter((t) => t !== props.value)}>
      {(tone) => (
        <button
          type="button"
          class="tone-dot"
          style={{ "--swatch": `var(--s-${tone})` }}
          title={tone}
          onClick={(e) => {
            e.stopPropagation();
            props.onChange(tone);
            setOpen(false);
          }}
        />
      )}
    </For>
  );

  return (
    <div class={`tone-picker ${dir()}`} ref={ref}>
      <button
        type="button"
        class="tone-dot current"
        style={{ "--swatch": `var(--s-${props.value})` }}
        title={props.title ?? "Color"}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
      />
      <Show
        when={props.portal}
        fallback={
          <div class={`tone-pop${open() ? " is-open" : ""}`} ref={popRef}>
            <Options />
          </div>
        }
      >
        <Portal>
          <div
            class={`tone-pop portal ${dir()}${open() ? " is-open" : ""}`}
            ref={popRef}
            style={{ left: `${pos().x}px`, top: `${pos().y}px` }}
          >
            <Options />
          </div>
        </Portal>
      </Show>
    </div>
  );
};
