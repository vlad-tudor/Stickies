import { TonePicker } from "~/components/TonePicker/TonePicker";
import { type Tone } from "~/utils/tones";
import "./sticky-color-input.scss";

type StickyColorInputProps = {
  color: Tone;
  updateColor: (color: Tone) => void;
};

export const StickyColorInput = (props: StickyColorInputProps) => (
  <div class="sticky-color-input">
    <TonePicker
      value={props.color}
      onChange={props.updateColor}
      title="Note color"
      direction="down"
    />
  </div>
);
