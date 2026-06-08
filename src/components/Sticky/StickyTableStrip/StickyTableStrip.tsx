import { Show } from "solid-js";
import type { Editor } from "@tiptap/core";
import { activeEditor, editorTick } from "~/stores/editorStore";
import { editingStickyId } from "~/stores/uiStore";
import {
  BetweenHorizontalStart,
  BetweenHorizontalEnd,
  BetweenVerticalStart,
  BetweenVerticalEnd,
  PanelTop,
  Trash2,
} from "lucide-static";

import "./sticky-table-strip.scss";

type StickyTableStripProps = {
  stickyId: string;
};

type Chain = ReturnType<Editor["chain"]>;

// Contextual table controls that grow out of the note's left edge. Lives at the
// sticky root (NOT inside the editor's clipped body) so it can sit outside the
// note. Slides in while the cursor is in a table, out otherwise.
export const StickyTableStrip = (props: StickyTableStripProps) => {
  const editing = () => editingStickyId() === props.stickyId;

  const inTable = () => {
    editorTick(); // reactive dep — isActive() isn't reactive on its own
    const e = activeEditor();
    return !!e && e.isActive("table");
  };

  const run = (fn: (c: Chain) => Chain) => {
    const e = activeEditor();
    if (e) fn(e.chain().focus()).run();
  };

  // Keep the header pinned to the top row. Adding "above" while in the header
  // would drop a body row on top and push the header down (prosemirror-tables),
  // so redirect to add the body row just below the header instead.
  const addRowAbove = () => {
    const e = activeEditor();
    if (!e) return;
    const c = e.chain().focus();
    (e.isActive("tableHeader") ? c.addRowAfter() : c.addRowBefore()).run();
  };

  return (
    <Show when={editing()}>
      <div
        class={`table-strip${inTable() ? " is-open" : ""}`}
        onMouseDown={(e) => e.preventDefault()} // keep the editor selection
      >
        <div class="table-strip-group">
          <button class="table-strip-btn" title="Add row above"
            onClick={addRowAbove} innerHTML={BetweenHorizontalStart} />
          <button class="table-strip-btn" title="Add row below"
            onClick={() => run((c) => c.addRowAfter())} innerHTML={BetweenHorizontalEnd} />
          <button class="table-strip-btn" title="Delete row"
            onClick={() => run((c) => c.deleteRow())} innerHTML={Trash2} />
        </div>
        <div class="table-strip-group">
          <button class="table-strip-btn" title="Add column left"
            onClick={() => run((c) => c.addColumnBefore())} innerHTML={BetweenVerticalStart} />
          <button class="table-strip-btn" title="Add column right"
            onClick={() => run((c) => c.addColumnAfter())} innerHTML={BetweenVerticalEnd} />
          <button class="table-strip-btn" title="Delete column"
            onClick={() => run((c) => c.deleteColumn())} innerHTML={Trash2} />
        </div>
        <div class="table-strip-group">
          <button class="table-strip-btn" title="Toggle header row"
            onClick={() => run((c) => c.toggleHeaderRow())} innerHTML={PanelTop} />
        </div>
      </div>
    </Show>
  );
};
