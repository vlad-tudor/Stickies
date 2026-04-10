import { createSignal, For } from "solid-js";
import {
  boards,
  activeBoardId,
  switchBoard,
  createBoard,
  deleteBoard,
  renameBoard,
  Board,
} from "~/stores/stickyStore";
import "./board-tabs.scss";

export const BoardTabs = () => {
  const [editingId, setEditingId] = createSignal<string | null>(null);
  let editInputRef!: HTMLInputElement;

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

  return (
    <div class="board-tabs">
      <div class="board-tabs-list">
        <For each={boards()}>
          {(board) => (
            <div
              class={`board-tab ${board.id === activeBoardId() ? "active" : ""}`}
              onClick={() => switchBoard(board.id)}
              onDblClick={() => startRename(board.id)}
            >
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
                  {"\u2715"}
                </button>
              )}
            </div>
          )}
        </For>
      </div>
      <button class="board-tab-add" onClick={() => createBoard()}>+</button>
    </div>
  );
};
