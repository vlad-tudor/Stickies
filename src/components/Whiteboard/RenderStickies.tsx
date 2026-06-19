import { createMemo, For } from "solid-js";
import {
  updateStickyNote,
  moveStickyNote,
  resizeStickyNote,
  commitStickies,
  deleteStickyNote,
} from "~/stores/stickyStore";
import { usePane } from "~/stores/paneContext";
import { Sticky } from "../Sticky/Sticky";

export const RenderStickies = () => {
  const pane = usePane();

  // The stickies array order IS the z-order. Map id -> stacking index so a
  // raise only changes z-index values, never the rendered DOM order.
  const stackById = createMemo(() => {
    const m = new Map<string, number>();
    pane.stickies().forEach((s, i) => m.set(s.id, i));
    return m;
  });

  // Render in a STABLE order (by id) so <For> never moves DOM nodes when the
  // z-order changes — that move was eating clicks and breaking drags. String
  // compare, NOT Number(): image-note ids aren't numeric, so `Number(id)` is NaN
  // → an unstable sort → DOM reorder mid-drag → lost pointer capture → stuck drag.
  const renderList = createMemo(() =>
    [...pane.stickies()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  );

  return (
    <For each={renderList()}>
      {(sticky, renderIdx) => {
        const idx = () => stackById().get(sticky.id) ?? 0; // stacking (z) index
        const active = () => idx() === pane.stickies().length - 1;
        return (
          <Sticky
            index={idx()}
            seq={renderIdx() + 1}
            active={active()}
            sticky={sticky}
            updateSticky={(update) => updateStickyNote(idx(), update)}
            moveSticky={(position) => moveStickyNote(idx(), position)}
            resizeSticky={(dimensions) => resizeStickyNote(idx(), dimensions)}
            commitSticky={() => commitStickies()}
            deleteSticky={() => deleteStickyNote(idx())}
          />
        );
      }}
    </For>
  );
};
