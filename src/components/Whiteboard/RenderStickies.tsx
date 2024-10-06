import { For, onMount } from "solid-js";
import {
  stickies,
  updateStickyNote,
  deleteStickyNote,
  loadStickiesFromLocalStorage,
} from "~/stores/stickyStore";
import { Sticky } from "../Sticky/Sticky";

export const RenderStickies = () => {
  /**
   * @note perhaps more suited to load stickies at some grander INIT step later on,
   *  -- perhaps as the actual stickies page loads?
   * */
  onMount(() => {
    loadStickiesFromLocalStorage();
  });

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
