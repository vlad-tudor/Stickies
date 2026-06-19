import { createContext, useContext, type Accessor } from "solid-js";
import { boards, type StickyNote, type Thread } from "~/stores/stickyStore";
import { DEFAULT_TONE, type Tone } from "~/utils/tones";

// A board pane, scoped to one boardId. RENDERING reads its board through this (NOT
// the global active board), so multiple panes can each show a different board.
// Mutations still go through the global (active-board) store fns for now —
// interacting with a pane focuses it (sets the active board), so they land on the
// right board. Fully boardId-scoped mutations come with the recursive layout (C).
export type Pane = {
  boardId: Accessor<string>;
  stickies: Accessor<StickyNote[]>;
  threads: Accessor<Thread[]>;
  bgColor: Accessor<Tone>;
  focused: Accessor<boolean>; // only the focused pane mounts editors
};

export function createPane(boardId: Accessor<string>, focused: Accessor<boolean>): Pane {
  const board = () => boards().find((b) => b.id === boardId());
  return {
    boardId,
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
