import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { activeBoardId, switchBoard } from "~/stores/stickyStore";

// Split-view layout: which boards live in which side-by-side panes, their relative
// sizes (flex-grow weights), and which pane is focused. The focused pane's board is
// kept as the global active board, so the (active-board) mutation fns target it.
export type PaneDef = { id: string; boardId: string; size: number };

const [panes, setPanes] = createStore<PaneDef[]>([]);
const [focusedPaneId, setFocusedPaneId] = createSignal("");

let seq = 0;
const makeId = () => `pane-${++seq}`;

export { panes, focusedPaneId };

// Bootstrap one pane bound to the active board (call once boards are loaded, and
// after creating the first board from the empty state).
export function ensurePanes(): void {
  if (panes.length > 0) return;
  const boardId = activeBoardId();
  if (!boardId) return;
  const id = makeId();
  setPanes([{ id, boardId, size: 1 }]);
  setFocusedPaneId(id);
}

// Focus a pane → make its board the active board SYNCHRONOUSLY, so a pointerdown
// that focuses the pane lands its selection/mutations on the right board.
export function focusPane(id: string): void {
  if (focusedPaneId() === id) return; // fired on every pointerdown — skip no-ops
  setFocusedPaneId(id);
  const p = panes.find((x) => x.id === id);
  if (p?.boardId) switchBoard(p.boardId);
}

// Show a board in the focused pane (e.g. clicking a tab).
export function showBoardInFocusedPane(boardId: string): void {
  const i = panes.findIndex((p) => p.id === focusedPaneId());
  if (i === -1) return;
  setPanes(i, "boardId", boardId);
  switchBoard(boardId);
}

// Split a pane: insert a sibling after it showing the same board, then focus it.
export function splitPane(afterId: string): void {
  const i = panes.findIndex((p) => p.id === afterId);
  if (i === -1) return;
  const id = makeId();
  const boardId = panes[i].boardId;
  setPanes(produce((p) => p.splice(i + 1, 0, { id, boardId, size: 1 })));
  focusPane(id);
}

// Close a pane (no-op if it's the last). Focus a neighbour if it was focused.
export function closePane(id: string): void {
  if (panes.length <= 1) return;
  const i = panes.findIndex((p) => p.id === id);
  if (i === -1) return;
  const wasFocused = focusedPaneId() === id;
  setPanes(produce((p) => p.splice(i, 1)));
  if (wasFocused) {
    const next = panes[Math.min(i, panes.length - 1)];
    if (next) focusPane(next.id);
  }
}

// Resize two adjacent panes (during a divider drag) — sizes are flex weights.
export function resizePanes(index: number, sizeA: number, sizeB: number): void {
  if (index < 0 || index + 1 >= panes.length) return;
  setPanes(index, "size", sizeA);
  setPanes(index + 1, "size", sizeB);
}
