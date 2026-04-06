import { $prose } from "@milkdown/utils";
import {
  Plugin,
  PluginKey,
  NodeSelection,
  TextSelection,
} from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node } from "@milkdown/kit/prose/model";

const key = new PluginKey("block-select");

function findBlockAtHandle(
  view: EditorView,
  handle: HTMLElement,
): { pos: number; node: Node } | null {
  const handleRect = handle.getBoundingClientRect();
  const doc = view.state.doc;
  let found: { pos: number; node: Node } | null = null;

  doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset);
    if (dom && dom instanceof HTMLElement) {
      const rect = dom.getBoundingClientRect();
      if (handleRect.top >= rect.top - 5 && handleRect.top <= rect.bottom + 5) {
        found = { pos: offset, node };
      }
    }
  });

  return found;
}

function selectBlock(view: EditorView, pos: number, node: Node): void {
  let tr;
  try {
    tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos));
  } catch {
    tr = view.state.tr.setSelection(
      TextSelection.create(view.state.doc, pos + 1, pos + node.nodeSize - 1),
    );
  }
  view.dispatch(tr);
  view.focus();
}

export const blockSelect = $prose(() => new Plugin({
  key,
  view(editorView) {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      const item = target.closest(".milkdown-block-handle .operation-item:last-child");
      if (!item) return;

      e.preventDefault();
      e.stopPropagation();

      const handle = item.closest(".milkdown-block-handle") as HTMLElement;
      const block = findBlockAtHandle(editorView, handle);
      if (block) {
        selectBlock(editorView, block.pos, block.node);
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);

    return {
      destroy() {
        document.removeEventListener("pointerdown", onPointerDown, true);
      },
    };
  },
}));
