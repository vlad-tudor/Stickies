import { createSignal, For } from "solid-js";
import {
  boards,
  createBoard,
  deleteBoard,
  renameBoard,
  reorderBoards,
  Board,
} from "~/stores/stickyStore";
import { Pencil } from "lucide-static";
import "./board-tabs.scss";

// One pane's tab strip: shows all boards, highlights the pane's current board, and
// reports selections to the pane via onSelect. Board CRUD (create/rename/delete/
// reorder) is global.
type BoardTabsProps = {
  boardId: string;
  onSelect: (id: string) => void;
};

export const BoardTabs = (props: BoardTabsProps) => {
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
      <button class="board-tab-add" title="New board" onClick={() => props.onSelect(createBoard())}>+</button>
      <div class="board-tabs-list">
        <For each={boards()}>
          {(board) => (
            <div
              class={`board-tab ${board.id === props.boardId ? "active" : ""} ${dragId() === board.id ? "dragging" : ""}`}
              draggable={editingId() !== board.id}
              onClick={() => props.onSelect(board.id)}
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
