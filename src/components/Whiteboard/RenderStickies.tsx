import { createSignal, For, onMount, Show } from "solid-js";
import {
  stickies,
  updateStickyNote,
  deleteStickyNote,
  loadStickiesFromLocalStorage,
} from "~/stores/stickyStore";
import { preRenderAll } from "~/components/Markdown/markdownEditor";
import { Sticky } from "../Sticky/Sticky";

export const RenderStickies = () => {
  const [preRendered, setPreRendered] = createSignal<Map<string, string> | null>(null);

  onMount(async () => {
    loadStickiesFromLocalStorage();
    const rendered = await preRenderAll(stickies());
    setPreRendered(rendered);
  });

  return (
    <Show when={preRendered()}>
      {(htmlMap) => (
        <For each={stickies()}>
          {(sticky, index) => (
            <Sticky
              index={index()}
              active={index() === stickies().length - 1}
              sticky={sticky}
              initialHtml={htmlMap().get(sticky.id)}
              updateSticky={(update) => updateStickyNote(index(), update)}
              deleteSticky={() => deleteStickyNote(index())}
            />
          )}
        </For>
      )}
    </Show>
  );
};
