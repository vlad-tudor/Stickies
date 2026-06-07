import { For } from "solid-js";
import { TONES, type Tone } from "~/utils/tones";
import "./sticky-color-input.scss";

type StickyColorInputProps = {
  color: Tone;
  updateColor: (color: Tone) => void;
};

export const StickyColorInput = (props: StickyColorInputProps) => (
  <div class="sticky-color-input">
    <For each={TONES}>
      {(tone) => (
        <button
          type="button"
          class={`sticky-swatch ${props.color === tone ? "is-selected" : ""}`}
          style={{ "--swatch": `var(--s-${tone})` }}
          title={tone}
          onClick={(e) => {
            e.stopPropagation();
            props.updateColor(tone);
          }}
        />
      )}
    </For>
  </div>
);
