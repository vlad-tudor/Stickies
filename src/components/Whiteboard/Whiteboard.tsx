import { For } from "solid-js";

import { stickies, updateStickyNote } from "~/stores/stickyStore";
import { Sticky } from "../Sticky/Sticky";

import "./whiteboard.scss";

// board where sticky notes are placed and moved around
// sticky notes are draggable and can be deleted, but that's a detail of the stickies.
export const Whiteboard = () => {
  return (
    <div class="whiteboard">
      <For each={stickies()}>
        {(sticky, index) => (
          <Sticky
            index={index()}
            active={index() === stickies().length - 1}
            sticky={sticky}
            updateSticky={(update) => updateStickyNote(index(), update)}
          />
        )}
      </For>
    </div>
  );
};
