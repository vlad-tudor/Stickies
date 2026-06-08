import { createEffect, createSignal, For, onCleanup } from "solid-js";
import { TONES, type Tone } from "~/utils/tones";

import "./tone-picker.scss";

type TonePickerProps = {
  value: Tone;
  onChange: (tone: Tone) => void;
  title?: string;
  direction?: "up" | "down"; // where the popover opens (default up)
};

// A single current-color dot that opens a floating paper popover of the other
// tones. Shared by the per-note color and the board hue.
export const TonePicker = (props: TonePickerProps) => {
  const [open, setOpen] = createSignal(false);
  let ref!: HTMLDivElement;

  const onDocDown = (e: PointerEvent) => {
    if (ref && !ref.contains(e.target as Node)) setOpen(false);
  };

  createEffect(() => {
    if (open()) document.addEventListener("pointerdown", onDocDown, true);
    else document.removeEventListener("pointerdown", onDocDown, true);
  });
  onCleanup(() => document.removeEventListener("pointerdown", onDocDown, true));

  return (
    <div class={`tone-picker ${props.direction ?? "up"}`} ref={ref}>
      <button
        type="button"
        class="tone-dot current"
        style={{ "--swatch": `var(--s-${props.value})` }}
        title={props.title ?? "Color"}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      />
      <div class={`tone-pop${open() ? " is-open" : ""}`}>
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
      </div>
    </div>
  );
};
