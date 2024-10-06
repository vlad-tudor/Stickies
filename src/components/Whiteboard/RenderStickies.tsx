import { For } from "solid-js";
import {
  stickies,
  updateStickyNote,
  deleteStickyNote,
} from "~/stores/stickyStore";
import { Sticky } from "../Sticky/Sticky";

// Move out? Idk, who cares
export const RenderStickies = () => {
  return (
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
  );
};
