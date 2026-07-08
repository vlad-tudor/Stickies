import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { createDebouncedWrite } from "~/utils/debouncedWrite";
import {
  activeBoardId,
  switchBoard,
  moveStickyToBoard,
  boards,
} from "~/stores/stickyStore";
import { exitEditing } from "~/stores/uiStore";
import { getViewport } from "~/stores/workspace/viewportStore";
import {
  NodeType,
  SplitDir,
  Zone,
  leafIds,
  replaceLeaf,
  removeLeaf,
  mapSplit,
  maxIdSuffix,
  type LayoutNode,
  type LeafNode,
  type SplitNode,
  type DropZone,
} from "~/domain/layout";
import type { Tone } from "~/utils/tones";

// Split-view layout state. The pure tree math lives in ~/domain/layout; this
// store owns two pieces kept deliberately separate:
//   1. a FLAT registry of panes (id -> boardId) — the leaves. Rendered via a flat
//      <For> keyed by id, so restructuring the tree never remounts a pane (its
//      viewport/editor survive).
//   2. an immutable TREE of pane ids (row/col splits) — the geometry. Each pane's
//      rect is computed from the tree (fractions 0..1) and applied as absolute %.
// The focused pane's board is mirrored to the global active board, so board-tab
// UI and share follow the pane the user is working in.
// Re-exported domain pieces keep one import site for layout consumers.
export {
  computeLayout,
  findSplit,
  zoneAt,
  DROP_EDGE,
  SplitDir,
  Zone,
} from "~/domain/layout";
export type { LayoutNode, SplitNode, LeafNode, Rect, Divider, DropZone } from "~/domain/layout";

export type PaneDef = { id: string; boardId: string };

const [panes, setPanes] = createStore<PaneDef[]>([]);
const [layout, setLayout] = createSignal<LayoutNode | null>(null);
const [focusedPaneId, setFocusedPaneId] = createSignal("");

let idCounter = 0;
const nextPaneId = () => `pane-${++idCounter}`;
const nextSplitId = () => `split-${++idCounter}`;

export { panes, layout, focusedPaneId };

// ── persistence (split layout survives reload) ──

const LAYOUT_KEY = "stickies.layout";

// Debounced (per-frame divider drags coalesce); flushed on page hide like the
// board snapshot.
const layoutSnapshot = createDebouncedWrite(
  () => {
    const root = layout();
    if (!root) {
      localStorage.removeItem(LAYOUT_KEY);
      return;
    }
    localStorage.setItem(
      LAYOUT_KEY,
      JSON.stringify({
        panes: [...panes],
        layout: root,
        focusedPaneId: focusedPaneId(),
      }),
    );
  },
  { flushOnPageHide: true },
);

const persistLayout = layoutSnapshot.schedule;

// Restore a saved split layout, dropping any pane whose board no longer exists (the
// tree collapses around it). Returns false → caller bootstraps a fresh single pane.
function restoreLayout(): boolean {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return false;
    // JSON.parse is untyped; this cast states the persisted layout format
    const saved = JSON.parse(raw) as {
      panes?: PaneDef[];
      layout?: LayoutNode;
      focusedPaneId?: string;
    };
    if (!saved.layout || !Array.isArray(saved.panes) || saved.panes.length === 0) {
      return false;
    }

    const liveBoards = new Set(boards().map((board) => board.id));
    const keepPaneIds = new Set(
      saved.panes
        .filter((pane) => liveBoards.has(pane.boardId))
        .map((pane) => pane.id),
    );
    if (keepPaneIds.size === 0) return false;

    // drop leaves whose board is gone; removeLeaf collapses single-child splits
    let tree: LayoutNode | null = saved.layout;
    for (const paneId of leafIds(saved.layout)) {
      if (!keepPaneIds.has(paneId)) tree = tree ? removeLeaf(tree, paneId) : null;
    }
    if (!tree) return false;

    const liveIds = new Set(leafIds(tree));
    const restored = saved.panes.filter((pane) => liveIds.has(pane.id));
    if (restored.length === 0) return false;

    // resume above everything SAVED (not just kept): a dropped stale pane's id
    // must never be re-minted — the new pane would inherit its persisted
    // viewport key (stickies.view.<paneId>)
    idCounter = maxIdSuffix(saved.layout, saved.panes.map((pane) => pane.id));
    setPanes(restored);
    setLayout(tree);
    const focus =
      saved.focusedPaneId && liveIds.has(saved.focusedPaneId)
        ? saved.focusedPaneId
        : leafIds(tree)[0];
    setFocusedPaneId(focus);
    const focusedPane = restored.find((pane) => pane.id === focus);
    if (focusedPane) switchBoard(focusedPane.boardId);
    return true;
  } catch {
    return false; // corrupt / old-schema blob → fresh single pane
  }
}

// ── operations ──

// Bootstrap panes (call once boards are loaded, and after creating the first board
// from the empty state): restore the saved split layout if valid, else one pane on
// the active board.
export function ensurePanes(): void {
  if (panes.length > 0) return;
  if (restoreLayout()) return;
  const boardId = activeBoardId();
  if (!boardId) return;
  const paneId = nextPaneId();
  setPanes([{ id: paneId, boardId }]);
  setLayout({ type: NodeType.Leaf, paneId });
  setFocusedPaneId(paneId);
  persistLayout();
}

// Drop ALL layout state (tests / workspace teardown) — ensurePanes() afterwards
// bootstraps from scratch.
export function resetPaneLayout(): void {
  setPanes([]);
  setLayout(null);
  setFocusedPaneId("");
  idCounter = 0;
  setBoardDrag(null);
  setStickyDrag(null);
}

// Rebind any pane whose board no longer exists onto a live board, so a board deleted
// while shown in ANOTHER pane doesn't leave that pane stale. Driven reactively off the
// board list (see Whiteboard). All boards gone → drop the layout (empty state).
export function reconcilePanes(): void {
  if (panes.length === 0) return;
  const liveBoards = new Set(boards().map((board) => board.id));
  if (liveBoards.size === 0) {
    setPanes([]);
    setLayout(null);
    setFocusedPaneId("");
    persistLayout();
    return;
  }
  const fallback = liveBoards.has(activeBoardId())
    ? activeBoardId()
    : boards()[0].id;
  let changed = false;
  panes.forEach((pane, index) => {
    if (!liveBoards.has(pane.boardId)) {
      setPanes(index, "boardId", fallback);
      changed = true;
    }
  });
  if (changed) {
    const focusedPane = panes.find((pane) => pane.id === focusedPaneId());
    if (focusedPane) switchBoard(focusedPane.boardId); // keep active board mirrored
    persistLayout();
  }
}

// Focus a pane → make its board the active board SYNCHRONOUSLY (a pointerdown that
// focuses the pane must land selection/mutations on the right board).
export function focusPane(id: string): void {
  if (focusedPaneId() === id) return; // fired on every pointerdown — skip no-ops
  exitEditing(); // moving focus to another pane closes any open editor
  setFocusedPaneId(id);
  const focusedPane = panes.find((pane) => pane.id === id);
  if (focusedPane?.boardId) switchBoard(focusedPane.boardId);
  persistLayout();
}

// Show a board in the focused pane (clicking a tab).
export function showBoardInFocusedPane(boardId: string): void {
  const focusedIdx = panes.findIndex((pane) => pane.id === focusedPaneId());
  if (focusedIdx === -1) return;
  setPanes(focusedIdx, "boardId", boardId);
  switchBoard(boardId);
  persistLayout();
}

// Split a pane in `dir` ("row" = side-by-side, "col" = stacked): wrap its leaf in a
// split with a NEW sibling pane bound to `boardId`, then focus the new pane.
// `before` puts the new pane first.
function splitPaneWithBoard(
  targetId: string,
  dir: SplitDir,
  before: boolean,
  boardId: string,
): void {
  const root = layout();
  if (!root) return;
  const paneId = nextPaneId();
  setPanes(produce((list) => list.push({ id: paneId, boardId })));
  const newLeaf: LeafNode = { type: NodeType.Leaf, paneId };
  const wrap = (leaf: LeafNode): SplitNode => ({
    type: NodeType.Split,
    id: nextSplitId(),
    dir,
    children: before ? [newLeaf, leaf] : [leaf, newLeaf],
    sizes: [1, 1],
  });
  setLayout(
    root.type === NodeType.Leaf && root.paneId === targetId
      ? wrap(root)
      : replaceLeaf(root, targetId, wrap),
  );
  focusPane(paneId); // persists (focus changed)
}

// Split a pane (new sibling shows the same board) — used by the split button.
export function splitPane(targetId: string, dir: SplitDir, before = false): void {
  const boardId =
    panes.find((pane) => pane.id === targetId)?.boardId ?? activeBoardId();
  splitPaneWithBoard(targetId, dir, before, boardId);
}

// Close a pane (no-op if it's the last). Focus a neighbour if it was focused.
export function closePane(id: string): void {
  if (panes.length <= 1) return;
  const root = layout();
  if (!root) return;
  const remaining = removeLeaf(root, id);
  setLayout(remaining);
  setPanes(
    produce((list) => {
      const index = list.findIndex((pane) => pane.id === id);
      if (index >= 0) list.splice(index, 1);
    }),
  );
  if (focusedPaneId() === id) {
    const survivor = leafIds(remaining)[0];
    if (survivor) {
      // force re-focus (the guard would skip since focusedPaneId still == id)
      setFocusedPaneId("");
      focusPane(survivor);
    }
  }
  persistLayout();
}

// Resize two adjacent children of a split node (during a divider drag).
export function resizeSplit(
  nodeId: string,
  index: number,
  sizeA: number,
  sizeB: number,
): void {
  const root = layout();
  if (!root) return;
  setLayout(
    mapSplit(root, nodeId, (split) => ({
      ...split,
      sizes: split.sizes.map((size, at) => {
        if (at === index) return sizeA;
        if (at === index + 1) return sizeB;
        return size;
      }),
    })),
  );
  persistLayout();
}

// ── drag a board tab onto a pane → 4-way split / replace ──

type BoardDrag = {
  boardId: string;
  overPaneId: string | null;
  zone: DropZone | null;
};

const [boardDrag, setBoardDrag] = createSignal<BoardDrag | null>(null);
export { boardDrag };

export function startBoardDrag(boardId: string): void {
  setBoardDrag({ boardId, overPaneId: null, zone: null });
}

export function setBoardDragOver(paneId: string, zone: DropZone): void {
  const drag = boardDrag();
  if (drag && (drag.overPaneId !== paneId || drag.zone !== zone)) {
    setBoardDrag({ ...drag, overPaneId: paneId, zone });
  }
}

// Pointer moved off any pane (no valid drop target) — drop the preview, keep dragging.
export function clearBoardDragOver(): void {
  const drag = boardDrag();
  if (drag && (drag.overPaneId !== null || drag.zone !== null)) {
    setBoardDrag({ ...drag, overPaneId: null, zone: null });
  }
}

export function clearBoardDrag(): void {
  setBoardDrag(null);
}

// Drop a dragged board onto a pane: center = show it in that pane; an edge = split
// the pane that way with a new pane showing the board.
export function dropBoardIntoPane(
  overPaneId: string,
  zone: DropZone,
  boardId: string,
): void {
  if (zone === Zone.Center) {
    const paneIdx = panes.findIndex((pane) => pane.id === overPaneId);
    if (paneIdx >= 0) setPanes(paneIdx, "boardId", boardId);
    setFocusedPaneId(overPaneId);
    switchBoard(boardId);
    persistLayout();
    return;
  }
  const dir = zone === Zone.Left || zone === Zone.Right ? SplitDir.Row : SplitDir.Col;
  const before = zone === Zone.Left || zone === Zone.Top;
  splitPaneWithBoard(overPaneId, dir, before, boardId);
}

// ── drag a sticky NOTE across panes (into another board) ──

type StickyDrag = {
  stickyId: string;
  fromBoardId: string;
  title: string; // for the floating ghost
  color: Tone;
  x: number; // cursor (window coords)
  y: number;
  grabX: number; // grab offset from the note's top-left, in WORLD units (so the ghost
  grabY: number; // hangs from where it was grabbed, not its centre)
  targetPaneId: string | null;
};

const [stickyDrag, setStickyDrag] = createSignal<StickyDrag | null>(null);
export { stickyDrag };

export function startStickyDrag(info: Omit<StickyDrag, "targetPaneId">): void {
  setStickyDrag({ ...info, targetPaneId: null });
}

export function updateStickyDrag(x: number, y: number): void {
  const drag = stickyDrag();
  if (!drag) return;
  const paneElement = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-pane-id]");
  const targetPaneId = paneElement?.dataset.paneId ?? null;
  setStickyDrag({ ...drag, x, y, targetPaneId });
}

// Finish a sticky drag: if it ended over a DIFFERENT board's pane, move the note
// there. Same board / no target → nothing (the in-pane live move already
// positioned it).
export function dropSticky(): void {
  const drag = stickyDrag();
  setStickyDrag(null);
  if (!drag || !drag.targetPaneId) return;
  const target = panes.find((pane) => pane.id === drag.targetPaneId);
  if (!target || target.boardId === drag.fromBoardId) return;
  const viewport = getViewport(drag.targetPaneId);
  if (!viewport) return;
  // land the note's top-left exactly where the ghost showed it (cursor − grab offset),
  // so the drop matches the preview instead of re-centering on the cursor.
  const cursorWorld = viewport.eventToWorld({ x: drag.x, y: drag.y });
  moveStickyToBoard(drag.stickyId, drag.fromBoardId, target.boardId, {
    x: cursorWorld.x - drag.grabX,
    y: cursorWorld.y - drag.grabY,
  });
}
