// Pure split-layout math: the tree model and every stateless rule over it.
// No signals, no persistence — paneLayoutStore (workspace) owns the state and
// calls in here.

// Node kinds and split directions as checked consts (not naked strings).
export const NodeType = {
  Leaf: "leaf",
  Split: "split",
} as const;

export const SplitDir = {
  Row: "row",
  Col: "col",
} as const;
export type SplitDir = (typeof SplitDir)[keyof typeof SplitDir];

export type LeafNode = { type: typeof NodeType.Leaf; paneId: string };
export type SplitNode = {
  type: typeof NodeType.Split;
  id: string;
  dir: SplitDir;
  children: LayoutNode[];
  sizes: number[]; // flex weights, parallel to children
};
export type LayoutNode = LeafNode | SplitNode;

export type Rect = { x: number; y: number; w: number; h: number }; // fractions 0..1
export type Divider = {
  nodeId: string; // the split node this boundary belongs to
  index: number; // boundary after child `index`
  dir: SplitDir;
  pos: number; // boundary position along the split axis (fraction)
  start: number; // cross-axis start (fraction)
  length: number; // cross-axis length (fraction)
  span: number; // split's extent along its axis (fraction) — for resize px math
};

export const leafIds = (node: LayoutNode | null): string[] => {
  if (!node) return [];
  if (node.type === NodeType.Leaf) return [node.paneId];
  return node.children.flatMap(leafIds);
};

// Replace the leaf for `paneId` with wrap(leaf) (used to split it in place).
export const replaceLeaf = (
  node: LayoutNode,
  paneId: string,
  wrap: (leaf: LeafNode) => LayoutNode,
): LayoutNode => {
  if (node.type === NodeType.Leaf) {
    return node.paneId === paneId ? wrap(node) : node;
  }
  return {
    ...node,
    children: node.children.map((child) => replaceLeaf(child, paneId, wrap)),
  };
};

// Remove the leaf for `paneId`; collapse single-child splits; null if it empties out.
export const removeLeaf = (
  node: LayoutNode,
  paneId: string,
): LayoutNode | null => {
  if (node.type === NodeType.Leaf) {
    return node.paneId === paneId ? null : node;
  }
  const children: LayoutNode[] = [];
  const sizes: number[] = [];
  node.children.forEach((child, index) => {
    const kept = removeLeaf(child, paneId);
    if (kept) {
      children.push(kept);
      sizes.push(node.sizes[index]);
    }
  });
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { ...node, children, sizes };
};

// Apply `update` to the split node with id `splitId`.
export const mapSplit = (
  node: LayoutNode,
  splitId: string,
  update: (split: SplitNode) => SplitNode,
): LayoutNode => {
  if (node.type === NodeType.Leaf) return node;
  if (node.id === splitId) return update(node);
  return {
    ...node,
    children: node.children.map((child) => mapSplit(child, splitId, update)),
  };
};

// Compute every pane's rect (fractions) + the dividers, from a tree.
export function computeLayout(node: LayoutNode | null): {
  paneRects: Map<string, Rect>;
  dividers: Divider[];
} {
  const paneRects = new Map<string, Rect>();
  const dividers: Divider[] = [];
  const walk = (current: LayoutNode, rect: Rect): void => {
    if (current.type === NodeType.Leaf) {
      paneRects.set(current.paneId, rect);
      return;
    }
    const total = current.sizes.reduce((sum, size) => sum + size, 0) || 1;
    let offset = 0;
    current.children.forEach((child, index) => {
      const fraction = (current.sizes[index] ?? 1) / total;
      const childRect: Rect =
        current.dir === SplitDir.Row
          ? { x: rect.x + offset * rect.w, y: rect.y, w: fraction * rect.w, h: rect.h }
          : { x: rect.x, y: rect.y + offset * rect.h, w: rect.w, h: fraction * rect.h };
      walk(child, childRect);
      offset += fraction;
      if (index < current.children.length - 1) {
        dividers.push(
          current.dir === SplitDir.Row
            ? {
                nodeId: current.id,
                index,
                dir: SplitDir.Row,
                pos: rect.x + offset * rect.w,
                start: rect.y,
                length: rect.h,
                span: rect.w,
              }
            : {
                nodeId: current.id,
                index,
                dir: SplitDir.Col,
                pos: rect.y + offset * rect.h,
                start: rect.x,
                length: rect.w,
                span: rect.h,
              },
        );
      }
    });
  };
  if (node) walk(node, { x: 0, y: 0, w: 1, h: 1 });
  return { paneRects, dividers };
}

export function findSplit(
  node: LayoutNode | null,
  splitId: string,
): SplitNode | null {
  if (!node || node.type === NodeType.Leaf) return null;
  if (node.id === splitId) return node;
  for (const child of node.children) {
    const found = findSplit(child, splitId);
    if (found) return found;
  }
  return null;
}

// ── 4-way drop zones (drag a board tab onto a pane) ──

export const Zone = {
  Left: "left",
  Right: "right",
  Top: "top",
  Bottom: "bottom",
  Center: "center",
} as const;
export type DropZone = (typeof Zone)[keyof typeof Zone];

// Which 4-way drop zone a point (0..1 within the drop region) falls in: within
// DROP_EDGE of a side → that side (split); otherwise center (replace). Shared
// by the pointer drag (BoardTabs) and the pane drop layer.
export const DROP_EDGE = 0.25;
export const zoneAt = (pointX: number, pointY: number): DropZone => {
  const edgeDistance = {
    left: pointX,
    right: 1 - pointX,
    top: pointY,
    bottom: 1 - pointY,
  };
  const nearest = Math.min(
    edgeDistance.left,
    edgeDistance.right,
    edgeDistance.top,
    edgeDistance.bottom,
  );
  if (nearest > DROP_EDGE) return Zone.Center;
  if (nearest === edgeDistance.left) return Zone.Left;
  if (nearest === edgeDistance.right) return Zone.Right;
  if (nearest === edgeDistance.top) return Zone.Top;
  return Zone.Bottom;
};

// Highest numeric id suffix across a tree's nodes plus `extraIds` — so a
// restored id counter resumes ABOVE everything restored and new ids never
// collide with old ones.
export const maxIdSuffix = (root: LayoutNode, extraIds: string[]): number => {
  let highest = 0;
  const consider = (id: string): void => {
    const suffix = parseInt(id.slice(id.lastIndexOf("-") + 1), 10);
    if (Number.isFinite(suffix) && suffix > highest) highest = suffix;
  };
  extraIds.forEach(consider);
  const walk = (node: LayoutNode): void => {
    if (node.type === NodeType.Leaf) {
      consider(node.paneId);
    } else {
      consider(node.id);
      node.children.forEach(walk);
    }
  };
  walk(root);
  return highest;
};
