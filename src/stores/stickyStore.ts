import { createStore } from "solid-js/store";

const LOCAL_STORAGE_KEY = "stickies-storage";

export type StickyNote = {
  id: string;
  title?: string;
  position: [number, number];
  dimensions: [number, number];
  content: string; // markdown
  color: string;
};

/** store */
const [stickyNoteStore, setStickyNoteStore] = createStore<{
  stickies: StickyNote[];
}>({
  stickies: [],
});

const persistStickiesToLocalStorage = () => {
  const stickies = stickyNoteStore.stickies;
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stickies));
};

/**
 * Simple way to bring a sticky note to the front of the board,
 * which happens whenever a user interaction occurs.
 */
const bringToFront = (index: number) => {
  const sticky = stickyNoteStore.stickies[index];
  const stickies = stickyNoteStore.stickies.filter((_, i) => i !== index);
  setStickyNoteStore("stickies", [...stickies, sticky]);
};

/**
 * General update function for a sticky note.
 * Right now, persists every update to local storage.
 * @note could have an optional param to avoid persisting to local storage
 * -- might be useful during drag/resize/etc.
 */
export const updateStickyNote = (
  index: number,
  update: Partial<StickyNote>
) => {
  // a little wasteful to have two separate calls to setStickyNoteStore
  setStickyNoteStore("stickies", index, { ...update });
  bringToFront(index);

  // persist the sticky note to local storage
  persistStickiesToLocalStorage();
};

export const deleteStickyNote = (index: number) => {
  const stickies = stickyNoteStore.stickies.filter((_, i) => i !== index);
  setStickyNoteStore("stickies", stickies);
  persistStickiesToLocalStorage();
};

export const clearAllStickies = () => {
  setStickyNoteStore("stickies", []);
  persistStickiesToLocalStorage();
};

export const createStickyNote = (sticky: StickyNote) => {
  setStickyNoteStore("stickies", (prev) => [...prev, sticky]);
};

export const stickies = () => stickyNoteStore.stickies;

export const loadStickiesFromLocalStorage = () => {
  const stickies = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (stickies) {
    const parsedStickies = JSON.parse(stickies) as StickyNote[];
    setStickyNoteStore("stickies", parsedStickies);
  }
};

export const importStickies = (imported: StickyNote[]) => {
  setStickyNoteStore("stickies", imported);
  persistStickiesToLocalStorage();
};

export const exportStickies = (): string => {
  return JSON.stringify(stickyNoteStore.stickies, null, 2);
};
