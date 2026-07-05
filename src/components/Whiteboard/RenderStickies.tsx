import { createMemo, For } from "solid-js";
import {
  updateStickyNote,
  moveStickyNote,
  resizeStickyNote,
  commitStickies,
  deleteStickyNote,
  duplicateStickyNote,
} from "~/stores/stickyStore";
import { usePane } from "~/stores/paneContext";
import { Sticky } from "../Sticky/Sticky";

export const RenderStickies = () => {
  const pane = usePane();

  // Render in a STABLE order (by id) so <For> never moves DOM nodes when the
  // z-order changes — that move was eating clicks and breaking drags. String
  // compare, NOT Number(): image-note ids aren't numeric, so `Number(id)` is NaN
  // → an unstable sort → DOM reorder mid-drag → lost pointer capture → stuck drag.
  const renderList = createMemo(() =>
    [...pane.stickies()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  );

  // stacking comes from each note's z field; the top one is the "active" note
  const maxZ = createMemo(() => pane.stickies().reduce((m, s) => Math.max(m, s.z), -1));

  return (
    <For each={renderList()}>
      {(sticky, renderIdx) => {
        const boardId = () => pane.boardId();
        return (
          <Sticky
            z={sticky.z}
            seq={renderIdx() + 1}
            active={sticky.z === maxZ()}
            sticky={sticky}
            updateSticky={(update) => updateStickyNote(boardId(), sticky.id, update)}
            moveSticky={(position) => moveStickyNote(boardId(), sticky.id, position)}
            resizeSticky={(dimensions) => resizeStickyNote(boardId(), sticky.id, dimensions)}
            commitSticky={() => commitStickies()}
            deleteSticky={() => deleteStickyNote(boardId(), sticky.id)}
            duplicateSticky={() => duplicateStickyNote(boardId(), sticky.id)}
          />
        );
      }}
    </For>
  );
};
