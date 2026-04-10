import { WhiteboardActions } from "./WhiteboardActions/WhiteboardActions";
import { RenderStickies } from "./RenderStickies";
import { BoardTabs } from "../BoardTabs/BoardTabs";
import { activeBgColor, updateBoardBgColor } from "~/stores/stickyStore";

import "./whiteboard.scss";

export const Whiteboard = () => {
  return (
    <div class="whiteboard-container">
      <BoardTabs />
      <div class="whiteboard" style={{ "background-color": activeBgColor() }}>
        <WhiteboardActions bgColor={activeBgColor()} updateBgColor={updateBoardBgColor} />
        <RenderStickies />
      </div>
    </div>
  );
};
