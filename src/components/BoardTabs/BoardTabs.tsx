import { createSignal, For, Show } from "solid-js";
import {
  boards,
  createBoard,
  duplicateBoard,
  deleteBoard,
  renameBoard,
  reorderBoards,
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
import { animate } from "animejs";
import { MOTION } from "~/utils/motion";
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

export const BoardTabs = (props: BoardTabsProps) => {
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [dragId, setDragId] = createSignal<string | null>(null);
  const [ghost, setGhost] = createSignal<{ x: number; y: number; name: string } | null>(null);
  let editInputRef!: HTMLInputElement;

  // A press in progress (pre-drag). Becomes a drag once it travels DRAG_THRESHOLD;
  // otherwise it's a tap → select. Pointer-based so it works on touch (HTML5 DnD
  // doesn't), unifying tab reorder + drag-to-split-pane on one path.
  let press: { pointerId: number; x: number; y: number; boardId: string; el: HTMLElement } | null = null;
  let suppressClick = false; // swallow the synthetic click that can follow a drag
  let listEl!: HTMLDivElement;

  // FLIP: reorder, then slide each tab from its old x to its new one (so they don't snap).
  // The dragged tab is skipped — the floating ghost already represents it.
  const flipReorder = (mutate: () => void) => {
    const tabs = () => [...listEl.querySelectorAll<HTMLElement>(".board-tab")];
    const before = new Map<string, number>();
    for (const el of tabs()) before.set(el.dataset.boardId ?? "", el.getBoundingClientRect().left);
    mutate(); // reorderBoards → <For> moves the nodes synchronously
    for (const el of tabs()) {
      const id = el.dataset.boardId ?? "";
      if (id === dragId()) continue;
      const prev = before.get(id);
      if (prev === undefined) continue;
      const dx = prev - el.getBoundingClientRect().left;
      if (Math.abs(dx) < 1) continue;
      animate(el, { translateX: [dx, 0], duration: MOTION.enter, ease: "outCubic" });
    }
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

  const onTabClose = (e: MouseEvent, board: Board) => {
    e.stopPropagation();
    if (boards().length <= 1) return;
    if (confirm(`Delete "${board.name}"?`)) {
      deleteBoard(board.id);
    }
  };

  const onTabDuplicate = (e: MouseEvent, board: Board) => {
    e.stopPropagation();
    if (confirm(`Duplicate "${board.name}"? This copies all its notes and connections into a new board.`)) {
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
      setDragId(press.boardId); // threshold crossed → begin drag
      startBoardDrag(press.boardId);
    }
    const name = boards().find((b) => b.id === press!.boardId)?.name ?? "";
    setGhost({ x: e.clientX, y: e.clientY, name });

    const under = document.elementFromPoint(e.clientX, e.clientY);
    const overTab = under?.closest<HTMLElement>(".board-tab");
    if (overTab?.dataset.boardId) {
      const targetId = overTab.dataset.boardId;
      if (targetId !== dragId()) flipReorder(() => reorderBoards(dragId()!, targetId)); // live reorder, slid
      clearBoardDragOver();
      return;
    }
    const layer = under?.closest<HTMLElement>(".pane-drop-layer");
    const paneId = layer?.dataset.paneId;
    if (layer && paneId) {
      const r = layer.getBoundingClientRect();
      setBoardDragOver(paneId, zoneAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height));
      return;
    }
    clearBoardDragOver();
  };

  const endPress = () => {
    press?.el.releasePointerCapture?.(press.pointerId);
    press = null;
  };

  const onTabPointerUp = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.pointerId) return;
    if (dragId()) {
      const d = boardDrag();
      if (d?.overPaneId) dropBoardIntoPane(d.overPaneId, d.zone ?? "center", d.boardId);
      clearBoardDrag();
      setDragId(null);
      setGhost(null);
      suppressClick = true; // a real drag must not also fire select
    }
    endPress();
  };

  const onTabPointerCancel = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.pointerId) return;
    if (dragId()) {
      clearBoardDrag();
      setDragId(null);
      setGhost(null);
    }
    endPress();
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
      <div class="board-tabs-list" ref={listEl}>
        <For each={boards()}>
          {(board) => (
            <div
              class={`board-tab ${board.id === props.boardId ? "active" : ""} ${dragId() === board.id ? "dragging" : ""}`}
              data-board-id={board.id}
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
