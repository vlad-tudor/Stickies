import { createEffect, createSignal, For, on, onMount, Show } from "solid-js";
import {
  stickies,
  activeBoardId,
  updateStickyNote,
  deleteStickyNote,
  loadBoards,
} from "~/stores/stickyStore";
import { preRenderAll } from "~/components/Markdown/markdownEditor";
import { Sticky } from "../Sticky/Sticky";

export const RenderStickies = () => {
  const [preRendered, setPreRendered] = createSignal<Map<string, string> | null>(null);

  const reRender = async () => {
    setPreRendered(null);
    const rendered = await preRenderAll(stickies());
    setPreRendered(rendered);
  };

  onMount(() => {
    loadBoards();
    reRender();
  });

  // re-render stickies when switching boards
  createEffect(on(activeBoardId, () => {
    reRender();
  }, { defer: true }));

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
