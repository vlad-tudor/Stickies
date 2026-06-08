import { createSignal } from "solid-js";
import type { Editor } from "@tiptap/core";

// The Tiptap editor of the note currently being edited (or null). Only one note
// edits at a time, so a single global instance is enough. Lets sticky-level
// chrome (the table strip, which lives OUTSIDE the editor's clipped body) drive
// the editor without prop-drilling through StickyMarkdown.
export const [activeEditor, setActiveEditor] = createSignal<Editor | null>(null);

// Bumped on every editor transaction / selection change. `isActive(...)` isn't
// reactive on its own, so anything that reflects editor state subscribes to this.
export const [editorTick, setEditorTick] = createSignal(0);
export const bumpEditorTick = (): void => {
  setEditorTick((t) => t + 1);
};
