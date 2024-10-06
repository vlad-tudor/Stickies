import { WhiteboardActions } from "./WhiteboardActions/WhiteboardActions";
import { RenderStickies } from "./RenderStickies";

import "./whiteboard.scss";

/**
 * Space into which sticky notes are placed and moved around.
 * Right now there's nothing special about the whiteboard itself
 */
export const Whiteboard = () => {
  return (
    <div class="whiteboard">
      <WhiteboardActions />
      <RenderStickies />
    </div>
  );
};
