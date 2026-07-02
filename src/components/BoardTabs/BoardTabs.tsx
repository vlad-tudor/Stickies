import { createSignal, For, Show } from "solid-js";
import {
  boards,
  createBoard,
  duplicateBoard,
  deleteBoard,
  renameBoard,
  reorderBoardTo,
  Board,
} from "~/stores/stickyStore";
import {
  startBoardDrag,
  clearBoardDrag,
  setBoardDragOver,
  clearBoardDragOver,
  dropBoardIntoPane,
  boardDrag,
  zoneAt,
} from "~/stores/paneLayoutStore";
import { confirmDialog } from "~/stores/dialogStore";
import { Pencil, CopyPlus } from "lucide-static";
import "./board-tabs.scss";

// One pane's tab strip: shows all boards, highlights the pane's current board, and
// reports selections to the pane via onSelect. Board CRUD (create/rename/delete/
// reorder) is global.
type BoardTabsProps = {
  boardId: string;
  onSelect: (id: string) => void;
};

const DRAG_THRESHOLD = 6; // px the pointer must travel before a press becomes a drag
const SPLIT_SLOP = 24; // px below the strip before a drag becomes a split-onto-pane

export const BoardTabs = (props: BoardTabsProps) => {
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [dragId, setDragId] = createSignal<string | null>(null);
  const [mode, setMode] = createSignal<"reorder" | "split">("reorder");
  const [offsetX, setOffsetX] = createSignal(0); // dragged tab's translate (follows cursor)
  const [targetIndex, setTargetIndex] = createSignal(0); // insertion slot among the OTHER tabs
  const [ghost, setGhost] = createSignal<{ x: number; y: number; name: string } | null>(null);
  let editInputRef!: HTMLInputElement;
  let listEl!: HTMLDivElement;

  // A press in progress (pre-drag). Becomes a drag once it travels DRAG_THRESHOLD;
  // otherwise it's a tap → select.
  let press: { pointerId: number; x: number; y: number; boardId: string; el: HTMLElement } | null = null;
  let suppressClick = false; // swallow the synthetic click that can follow a drag

  // Drag scratch, measured ONCE when the drag begins (the order isn't mutated mid-drag,
  // so these stay valid — that's what keeps it from thrashing).
  let dragFromIndex = 0;
  let draggedWidth = 0;
  let dragStartX = 0;
  let centers: number[] = []; // each tab's centre x (viewport), in board order
  let stripBottom = 0;

  const beginDrag = (boardId: string, startX: number) => {
    const tabEls = [...listEl.querySelectorAll<HTMLElement>(".board-tab")];
    centers = tabEls.map((el) => {
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2;
    });
    dragFromIndex = boards().findIndex((b) => b.id === boardId);
    draggedWidth = tabEls[dragFromIndex]?.getBoundingClientRect().width ?? 0;
    dragStartX = startX;
    stripBottom = listEl.getBoundingClientRect().bottom;
    setOffsetX(0);
    setTargetIndex(dragFromIndex < 0 ? 0 : dragFromIndex);
    setMode("reorder");
    setDragId(boardId);
    startBoardDrag(boardId);
  };

  // Per-tab transform during a reorder: the dragged tab tracks the cursor; the others
  // slide by one dragged-width to open the gap at the target slot (and close the one the
  // dragged tab left). Only ever 0 / ±draggedWidth, so no compounding jitter.
  const tabTransform = (board: Board, i: number): string | undefined => {
    if (!dragId() || mode() !== "reorder") return undefined;
    if (board.id === dragId()) return `translateX(${offsetX()}px)`;
    const ti = targetIndex();
    const oi = i < dragFromIndex ? i : i - 1; // index among the OTHER tabs
    const finalFull = oi < ti ? oi : oi + 1; // where it lands once the dragged is inserted
    const shift = (finalFull - i) * draggedWidth;
    return shift ? `translateX(${shift}px)` : undefined;
  };

  const startRename = (id: string) => {
    setEditingId(id);
    requestAnimationFrame(() => {
      editInputRef?.focus();
      editInputRef?.select();
    });
  };

  const commitRename = (id: string) => {
    const val = editInputRef?.value.trim();
    if (val) renameBoard(id, val);
    setEditingId(null);
  };

  const onTabClose = async (e: MouseEvent, board: Board) => {
    e.stopPropagation();
    if (boards().length <= 1) return;
    if (await confirmDialog(`Delete "${board.name}" and all its notes?`, {
      title: "Delete board",
      confirmText: "Delete",
      danger: true,
    })) {
      deleteBoard(board.id);
    }
  };

  const onTabDuplicate = async (e: MouseEvent, board: Board) => {
    e.stopPropagation();
    if (await confirmDialog("Copy all its notes and connections into a new board?", {
      title: `Duplicate "${board.name}"`,
      confirmText: "Duplicate",
    })) {
      const newId = duplicateBoard(board.id);
      if (newId) props.onSelect(newId); // open the copy in this pane
    }
  };

  const onTabPointerDown = (e: PointerEvent, board: Board) => {
    suppressClick = false;
    if (editingId() === board.id) return; // renaming: let the input handle it
    if (e.button !== 0 && e.pointerType === "mouse") return; // left button / touch only
    if ((e.target as HTMLElement).closest("button, input")) return; // a control, not the tab
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, boardId: board.id, el };
  };

  const onTabPointerMove = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.pointerId) return;
    if (!dragId()) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_THRESHOLD) return;
      beginDrag(press.boardId, press.x);
    }

    if (e.clientY <= stripBottom + SPLIT_SLOP) {
      // ── reorder within the strip: dragged tab follows the cursor, others slide ──
      setMode("reorder");
      setGhost(null);
      clearBoardDragOver();
      setOffsetX(e.clientX - dragStartX);
      const draggedCenter = centers[dragFromIndex] + offsetX();
      let ti = 0;
      for (let i = 0; i < centers.length; i++) {
        if (i !== dragFromIndex && centers[i] < draggedCenter) ti++;
      }
      setTargetIndex(ti);
    } else {
      // ── dragged below the strip → drop-onto-pane (split): ghost + pane preview ──
      setMode("split");
      setOffsetX(0);
      setGhost({ x: e.clientX, y: e.clientY, name: boards().find((b) => b.id === dragId())?.name ?? "" });
      const layer = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(".pane-drop-layer");
      const paneId = layer?.dataset.paneId;
      if (layer && paneId) {
        const r = layer.getBoundingClientRect();
        setBoardDragOver(paneId, zoneAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height));
      } else {
        clearBoardDragOver();
      }
    }
  };

  const resetDrag = () => {
    setDragId(null);
    setGhost(null);
    setOffsetX(0);
  };

  const onTabPointerUp = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.pointerId) return;
    if (dragId()) {
      if (mode() === "split") {
        const d = boardDrag();
        if (d?.overPaneId) dropBoardIntoPane(d.overPaneId, d.zone ?? "center", d.boardId);
      } else {
        reorderBoardTo(dragId()!, targetIndex()); // commit the reorder once
      }
      clearBoardDrag();
      resetDrag();
      suppressClick = true; // a real drag must not also fire select
    }
    press?.el.releasePointerCapture?.(press.pointerId);
    press = null;
  };

  const onTabPointerCancel = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.pointerId) return;
    if (dragId()) {
      clearBoardDrag();
      resetDrag();
    }
    press?.el.releasePointerCapture?.(press.pointerId);
    press = null;
  };

  const onTabClick = (board: Board) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    props.onSelect(board.id);
  };

  return (
    <div class="board-tabs">
      <button class="board-tab-add" title="New board" onClick={() => props.onSelect(createBoard())}>+</button>
      <div class={`board-tabs-list${dragId() && mode() === "reorder" ? " reordering" : ""}`} ref={listEl}>
        <For each={boards()}>
          {(board, index) => (
            <div
              class={`board-tab ${board.id === props.boardId ? "active" : ""}${
                dragId() === board.id ? (mode() === "reorder" ? " lifted" : " dimmed") : ""
              }`}
              data-board-id={board.id}
              style={{ transform: tabTransform(board, index()) }}
              onPointerDown={(e) => onTabPointerDown(e, board)}
              onPointerMove={onTabPointerMove}
              onPointerUp={onTabPointerUp}
              onPointerCancel={onTabPointerCancel}
              onClick={() => onTabClick(board)}
              onDblClick={() => startRename(board.id)}
            >
              {board.id === props.boardId && editingId() !== board.id && (
                <button
                  class="board-tab-edit"
                  title="Rename board"
                  onClick={(e) => {
                    e.stopPropagation();
                    startRename(board.id);
                  }}
                  innerHTML={Pencil}
                />
              )}
              {board.id === props.boardId && editingId() !== board.id && (
                <button
                  class="board-tab-dup"
                  title="Duplicate board"
                  onClick={(e) => onTabDuplicate(e, board)}
                  innerHTML={CopyPlus}
                />
              )}
              {editingId() === board.id ? (
                <input
                  ref={editInputRef}
                  class="board-tab-rename"
                  type="text"
                  value={board.name}
                  onBlur={() => commitRename(board.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(board.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span class="board-tab-name">{board.name}</span>
              )}
              {boards().length > 1 && (
                <button
                  class="board-tab-close"
                  onClick={(e) => onTabClose(e, board)}
                >
                  {"✕"}
                </button>
              )}
            </div>
          )}
        </For>
      </div>

      <Show when={ghost()}>
        {(g) => (
          <div class="board-tab-ghost" style={{ left: `${g().x}px`, top: `${g().y}px` }}>
            {g().name}
          </div>
        )}
      </Show>
    </div>
  );
};
