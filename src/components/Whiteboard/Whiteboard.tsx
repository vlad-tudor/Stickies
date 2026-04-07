import { createSignal } from "solid-js";
import { WhiteboardActions } from "./WhiteboardActions/WhiteboardActions";
import { RenderStickies } from "./RenderStickies";

import "./whiteboard.scss";

const BG_KEY = "whiteboard-bg";
const DEFAULT_BG = "#f3ebe2";

/**
 * Space into which sticky notes are placed and moved around.
 * Right now there's nothing special about the whiteboard itself
 */
export const Whiteboard = () => {
  const [bgColor, setBgColor] = createSignal(
    localStorage.getItem(BG_KEY) ?? DEFAULT_BG,
  );

  const updateBgColor = (color: string) => {
    setBgColor(color);
    localStorage.setItem(BG_KEY, color);
  };

  return (
    <div class="whiteboard" style={{ "background-color": bgColor() }}>
      <WhiteboardActions bgColor={bgColor()} updateBgColor={updateBgColor} />
      <RenderStickies />
    </div>
  );
};
