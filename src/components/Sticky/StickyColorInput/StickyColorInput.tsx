// SCSS in sticky.scss:
import "./sticky-color-input.scss";

type StickyColorInputProps = {
  color: string;
  updateColor: (color: string) => void;
};

export const StickyColorInput = (props: StickyColorInputProps) => (
  <input
    type="color"
    class="sticky-color-input"
    value={props.color}
    onInput={(e) => props.updateColor(e.currentTarget.value)}
  />
);
