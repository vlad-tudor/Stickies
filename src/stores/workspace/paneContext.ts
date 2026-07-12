import { createContext, useContext, type Accessor } from "solid-js";
import { boards, type Board, type StickyNote, type Thread } from "~/stores/stickyStore";
import { DEFAULT_TONE, type Tone } from "~/utils/tones";

// A board pane, scoped to one boardId. Rendering reads its board through this
// (NOT the global active board), and mutations pass `boardId()` to the
// boardId-scoped store fns — a pane never touches "the active board".
export type Pane = {
  boardId: Accessor<string>;
  board: Accessor<Board | undefined>;
  stickies: Accessor<StickyNote[]>;
  threads: Accessor<Thread[]>;
  bgColor: Accessor<Tone>;
  focused: Accessor<boolean>; // only the focused pane mounts editors
};

export function createPane(boardId: Accessor<string>, focused: Accessor<boolean>): Pane {
  const board = () => boards().find((candidate) => candidate.id === boardId());
  return {
    boardId,
    board,
    stickies: () => board()?.stickies ?? [],
    threads: () => board()?.threads ?? [],
    bgColor: () => board()?.bgColor ?? DEFAULT_TONE,
    focused,
  };
}

const PaneContext = createContext<Pane>();

export const PaneProvider = PaneContext.Provider;

// Read the board pane for the current surface. Must be under a <PaneProvider>.
export function usePane(): Pane {
  const pane = useContext(PaneContext);
  if (!pane) throw new Error("usePane must be used within a <PaneProvider>");
  return pane;
}
