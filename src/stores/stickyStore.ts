import { createStore } from "solid-js/store";

export type StickyNote = {
  id: string;
  position: [number, number];
  dimensions: [number, number];
  content: string; // markdown
  color: string;
};

const [stickyNoteStore, setStickyNoteStore] = createStore<{
  stickies: StickyNote[];
}>({
  stickies: [
    {
      id: "one",
      position: [50, 50],
      dimensions: [300, 300],
      content: "meow",
      color: "#e3d46f",
    },
    {
      id: "two",
      position: [50, 50],
      dimensions: [300, 300],
      content: "### meow",
      color: "#e3d46f",
    },
    {
      id: "three",
      position: [50, 50],
      dimensions: [300, 300],
      content: "# meow",
      color: "#e3d46f",
    },
  ],
});

export const updateStickyNote = (
  index: number,
  update: Partial<StickyNote>
) => {
  setStickyNoteStore("stickies", index, { ...update });
  bringToFront(index);
};

export const stickies = () => stickyNoteStore.stickies;

/**
 * Simple way to bring a sticky note to the front of the board,
 * which happens whenever a user interaction occurs.
 */
const bringToFront = (index: number) => {
  const sticky = stickyNoteStore.stickies[index];
  const stickies = stickyNoteStore.stickies.filter((_, i) => i !== index);
  setStickyNoteStore("stickies", [...stickies, sticky]);
};
