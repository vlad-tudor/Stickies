import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { activeBoardId, switchBoard } from "~/stores/stickyStore";

// Split-view layout. Two parts kept deliberately separate:
//   1. a FLAT registry of panes (id -> boardId) — the leaves. Rendered via a flat
//      <For> keyed by id, so restructuring the tree never remounts a pane (its
//      viewport/editor survive).
//   2. an immutable TREE of pane ids (row/col splits) — the geometry. Each pane's
//      rect is computed from the tree (fractions 0..1) and applied as absolute %.
// The focused pane's board is mirrored to the global active board, so the
// (active-board) mutation fns target it.

export type PaneDef = { id: string; boardId: string };

export type LeafNode = { type: "leaf"; paneId: string };
export type SplitNode = {
  type: "split";
  id: string;
  dir: "row" | "col";
  children: LayoutNode[];
  sizes: number[]; // flex weights, parallel to children
};
export type LayoutNode = LeafNode | SplitNode;

export type Rect = { x: number; y: number; w: number; h: number }; // fractions 0..1
export type Divider = {
  nodeId: string; // the split node this boundary belongs to
  index: number; // boundary after child `index`
  dir: "row" | "col";
  pos: number; // boundary position along the split axis (fraction)
  start: number; // cross-axis start (fraction)
  length: number; // cross-axis length (fraction)
  span: number; // split's extent along its axis (fraction) — for resize px math
};

const [panes, setPanes] = createStore<PaneDef[]>([]);
const [layout, setLayout] = createSignal<LayoutNode | null>(null);
const [focusedPaneId, setFocusedPaneId] = createSignal("");

let seq = 0;
const paneId = () => `pane-${++seq}`;
const splitId = () => `split-${++seq}`;

export { panes, layout, focusedPaneId };

// ── pure tree helpers ──

const leafIds = (node: LayoutNode | null): string[] => {
  if (!node) return [];
  if (node.type === "leaf") return [node.paneId];
  return node.children.flatMap(leafIds);
};

// replace the leaf for `pid` with fn(leaf) (used to split it in place)
const replaceLeaf = (
  node: LayoutNode,
  pid: string,
  fn: (leaf: LeafNode) => LayoutNode
): LayoutNode => {
  if (node.type === "leaf") return node.paneId === pid ? fn(node) : node;
  return { ...node, children: node.children.map((c) => replaceLeaf(c, pid, fn)) };
};

// remove the leaf for `pid`; collapse single-child splits; null if it empties out
const removeLeaf = (node: LayoutNode, pid: string): LayoutNode | null => {
  if (node.type === "leaf") return node.paneId === pid ? null : node;
  const children: LayoutNode[] = [];
  const sizes: number[] = [];
  node.children.forEach((c, i) => {
    const r = removeLeaf(c, pid);
    if (r) {
      children.push(r);
      sizes.push(node.sizes[i]);
    }
  });
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { ...node, children, sizes };
};

// apply fn to the split node with id `sid`
const mapSplit = (node: LayoutNode, sid: string, fn: (n: SplitNode) => SplitNode): LayoutNode => {
  if (node.type === "leaf") return node;
  if (node.id === sid) return fn(node);
  return { ...node, children: node.children.map((c) => mapSplit(c, sid, fn)) };
};

// Compute every pane's rect (fractions) + the dividers, from a tree.
export function computeLayout(node: LayoutNode | null): {
  paneRects: Map<string, Rect>;
  dividers: Divider[];
} {
  const paneRects = new Map<string, Rect>();
  const dividers: Divider[] = [];
  const walk = (n: LayoutNode, r: Rect) => {
    if (n.type === "leaf") {
      paneRects.set(n.paneId, r);
      return;
    }
    const total = n.sizes.reduce((a, b) => a + b, 0) || 1;
    let off = 0;
    n.children.forEach((c, i) => {
      const frac = (n.sizes[i] ?? 1) / total;
      const cr: Rect =
        n.dir === "row"
          ? { x: r.x + off * r.w, y: r.y, w: frac * r.w, h: r.h }
          : { x: r.x, y: r.y + off * r.h, w: r.w, h: frac * r.h };
      walk(c, cr);
      off += frac;
      if (i < n.children.length - 1) {
        dividers.push(
          n.dir === "row"
            ? { nodeId: n.id, index: i, dir: "row", pos: r.x + off * r.w, start: r.y, length: r.h, span: r.w }
            : { nodeId: n.id, index: i, dir: "col", pos: r.y + off * r.h, start: r.x, length: r.w, span: r.h }
        );
      }
    });
  };
  if (node) walk(node, { x: 0, y: 0, w: 1, h: 1 });
  return { paneRects, dividers };
}

export function findSplit(node: LayoutNode | null, sid: string): SplitNode | null {
  if (!node || node.type === "leaf") return null;
  if (node.id === sid) return node;
  for (const c of node.children) {
    const found = findSplit(c, sid);
    if (found) return found;
  }
  return null;
}

// ── operations ──

// Bootstrap one pane bound to the active board (call once boards are loaded, and
// after creating the first board from the empty state).
export function ensurePanes(): void {
  if (panes.length > 0) return;
  const boardId = activeBoardId();
  if (!boardId) return;
  const id = paneId();
  setPanes([{ id, boardId }]);
  setLayout({ type: "leaf", paneId: id });
  setFocusedPaneId(id);
}

// Focus a pane → make its board the active board SYNCHRONOUSLY (a pointerdown that
// focuses the pane must land selection/mutations on the right board).
export function focusPane(id: string): void {
  if (focusedPaneId() === id) return; // fired on every pointerdown — skip no-ops
  setFocusedPaneId(id);
  const p = panes.find((x) => x.id === id);
  if (p?.boardId) switchBoard(p.boardId);
}

// Show a board in the focused pane (clicking a tab).
export function showBoardInFocusedPane(boardId: string): void {
  const i = panes.findIndex((p) => p.id === focusedPaneId());
  if (i === -1) return;
  setPanes(i, "boardId", boardId);
  switchBoard(boardId);
}

// Split a pane in `dir` ("row" = side-by-side, "col" = stacked): wrap its leaf in a
// split with a new sibling pane (same board), then focus the new pane. `before`
// puts the new pane first.
export function splitPane(targetId: string, dir: "row" | "col", before = false): void {
  const root = layout();
  if (!root) return;
  const newId = paneId();
  const boardId = panes.find((p) => p.id === targetId)?.boardId ?? activeBoardId();
  setPanes(produce((p) => p.push({ id: newId, boardId })));
  const newLeaf: LeafNode = { type: "leaf", paneId: newId };
  const wrap = (leaf: LeafNode): SplitNode => ({
    type: "split",
    id: splitId(),
    dir,
    children: before ? [newLeaf, leaf] : [leaf, newLeaf],
    sizes: [1, 1],
  });
  setLayout(root.type === "leaf" && root.paneId === targetId ? wrap(root) : replaceLeaf(root, targetId, wrap));
  focusPane(newId);
}

// Close a pane (no-op if it's the last). Focus a neighbour if it was focused.
export function closePane(id: string): void {
  if (panes.length <= 1) return;
  const root = layout();
  if (!root) return;
  const next = removeLeaf(root, id);
  setLayout(next);
  setPanes(produce((p) => {
    const i = p.findIndex((x) => x.id === id);
    if (i >= 0) p.splice(i, 1);
  }));
  if (focusedPaneId() === id) {
    const first = leafIds(next)[0];
    if (first) {
      // force re-focus (the guard would skip since focusedPaneId still == id)
      setFocusedPaneId("");
      focusPane(first);
    }
  }
}

// Resize two adjacent children of a split node (during a divider drag).
export function resizeSplit(nodeId: string, index: number, sizeA: number, sizeB: number): void {
  const root = layout();
  if (!root) return;
  setLayout(
    mapSplit(root, nodeId, (n) => ({
      ...n,
      sizes: n.sizes.map((s, i) => (i === index ? sizeA : i === index + 1 ? sizeB : s)),
    }))
  );
}
