import { createMemo, For } from "solid-js";
import {
  stickies,
  updateStickyNote,
  moveStickyNote,
  resizeStickyNote,
  commitStickies,
  deleteStickyNote,
} from "~/stores/stickyStore";
import { Sticky } from "../Sticky/Sticky";

export const RenderStickies = () => {
  // The stickies array order IS the z-order. Map id -> stacking index so a
  // raise only changes z-index values, never the rendered DOM order.
  const stackById = createMemo(() => {
    const m = new Map<string, number>();
    stickies().forEach((s, i) => m.set(s.id, i));
    return m;
  });

  // Render in a STABLE order (by creation id) so <For> never moves DOM nodes
  // when the z-order changes — that move was eating clicks and breaking drags.
  const renderList = createMemo(() =>
    [...stickies()].sort((a, b) => Number(a.id) - Number(b.id))
  );

  return (
    <For each={renderList()}>
      {(sticky, renderIdx) => {
        const idx = () => stackById().get(sticky.id) ?? 0; // stacking (z) index
        return (
          <Sticky
            index={idx()}
            seq={renderIdx() + 1}
            active={idx() === stickies().length - 1}
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
