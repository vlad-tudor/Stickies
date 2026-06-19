import { createSignal, For } from "solid-js";
import {
  boards,
  activeBoardId,
  createBoard,
  deleteBoard,
  renameBoard,
  reorderBoards,
  Board,
} from "~/stores/stickyStore";
import { showBoardInFocusedPane } from "~/stores/paneLayoutStore";
import { Pencil } from "lucide-static";
import "./board-tabs.scss";

export const BoardTabs = () => {
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [dragId, setDragId] = createSignal<string | null>(null);
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
      <button class="board-tab-add" title="New board" onClick={() => createBoard()}>+</button>
      <div class="board-tabs-list">
        <For each={boards()}>
          {(board) => (
            <div
              class={`board-tab ${board.id === activeBoardId() ? "active" : ""} ${dragId() === board.id ? "dragging" : ""}`}
              draggable={editingId() !== board.id}
              onClick={() => showBoardInFocusedPane(board.id)}
              onDblClick={() => startRename(board.id)}
              onDragStart={(e) => {
                setDragId(board.id);
                e.dataTransfer?.setData("text/plain", board.id);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                const from = dragId();
                if (from && from !== board.id) reorderBoards(from, board.id);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={() => setDragId(null)}
            >
              {board.id === activeBoardId() && editingId() !== board.id && (
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
    </div>
  );
};
