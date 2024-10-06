import { createEffect, For } from "solid-js";

import {
  clearAllStickies,
  createStickyNote,
  deleteStickyNote,
  stickies,
  updateStickyNote,
} from "~/stores/stickyStore";
import { Sticky } from "../Sticky/Sticky";

import "./whiteboard.scss";

// board where sticky notes are placed and moved around
// sticky notes are draggable and can be deleted, but that's a detail of the stickies.
export const Whiteboard = () => {
  const onClearAllStickies = () => {
    if (confirm("Are you sure you want to clear all stickies?")) {
      clearAllStickies();
    }
  };

  const onStickyCreate = () => {
    createStickyNote({
      id: Date.now().toString(),
      position: [50, 50],
      dimensions: [300, 300],
      content: "...",
      color: "#e3d46f",
    });
  };

  return (
    <div class="whiteboard">
      <div class="whiteboard-actions">
        <button class="create-sticky" onClick={onStickyCreate}>
          +
        </button>

        <button class="refresh-stickies-positions">🔄</button>
        <button class="clear-all-stickies" onClick={onClearAllStickies}>
          🗑️
        </button>
      </div>
      <For each={stickies()}>
        {(sticky, index) => (
          <Sticky
            index={index()}
            active={index() === stickies().length - 1}
            sticky={sticky}
            updateSticky={(update) => updateStickyNote(index(), update)}
            deleteSticky={() => deleteStickyNote(index())}
          />
        )}
      </For>
    </div>
  );
};
