// Pure layout math of the split tree (rect computation, dividers, drop zones).
// Not touched by the collab rewrite, but load-bearing for every pane feature.
import { test, expect, describe } from "bun:test";
import {
  computeLayout,
  findSplit,
  zoneAt,
  dropZoneFor,
  dividerDragWeights,
  canSplit,
  mapSplit,
  replaceLeaf,
  MIN_PANE_PX,
  type Divider,
  type LayoutNode,
  type LeafNode,
  type SplitNode,
} from "./layout";

const leaf = (paneId: string): LayoutNode => ({ type: "leaf", paneId });

describe("computeLayout", () => {
  test("null tree yields nothing", () => {
    const { paneRects, dividers } = computeLayout(null);
    expect(paneRects.size).toBe(0);
    expect(dividers.length).toBe(0);
  });

  test("single leaf fills the unit rect", () => {
    const { paneRects, dividers } = computeLayout(leaf("p1"));
    expect(paneRects.get("p1")).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(dividers.length).toBe(0);
  });

  test("equal row split halves the width and places one divider", () => {
    const tree: SplitNode = {
      type: "split",
      id: "sp1",
      dir: "row",
      children: [leaf("p1"), leaf("p2")],
      sizes: [1, 1],
    };
    const { paneRects, dividers } = computeLayout(tree);
    expect(paneRects.get("p1")).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
    expect(paneRects.get("p2")).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 });
    expect(dividers).toEqual([
      { nodeId: "sp1", index: 0, dir: "row", pos: 0.5, start: 0, length: 1, span: 1 },
    ]);
  });

  test("sizes are flex weights", () => {
    const tree: SplitNode = {
      type: "split",
      id: "sp1",
      dir: "row",
      children: [leaf("p1"), leaf("p2")],
      sizes: [1, 3],
    };
    const { paneRects } = computeLayout(tree);
    expect(paneRects.get("p1")).toEqual({ x: 0, y: 0, w: 0.25, h: 1 });
    expect(paneRects.get("p2")).toEqual({ x: 0.25, y: 0, w: 0.75, h: 1 });
  });

  test("nested col inside row subdivides the child rect", () => {
    const tree: SplitNode = {
      type: "split",
      id: "row1",
      dir: "row",
      children: [
        leaf("p1"),
        {
          type: "split",
          id: "col1",
          dir: "col",
          children: [leaf("p2"), leaf("p3")],
          sizes: [1, 1],
        },
      ],
      sizes: [1, 1],
    };
    const { paneRects, dividers } = computeLayout(tree);
    expect(paneRects.get("p1")).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
    expect(paneRects.get("p2")).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
    expect(paneRects.get("p3")).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    expect(dividers.length).toBe(2);
    const col = dividers.find((d) => d.nodeId === "col1")!;
    expect(col).toEqual({
      nodeId: "col1",
      index: 0,
      dir: "col",
      pos: 0.5,
      start: 0.5,
      length: 0.5,
      span: 1,
    });
  });
});

describe("findSplit", () => {
  const tree: SplitNode = {
    type: "split",
    id: "outer",
    dir: "row",
    children: [
      leaf("p1"),
      { type: "split", id: "inner", dir: "col", children: [leaf("p2"), leaf("p3")], sizes: [1, 1] },
    ],
    sizes: [1, 1],
  };

  test("finds nested split nodes by id", () => {
    expect(findSplit(tree, "inner")?.dir).toBe("col");
    expect(findSplit(tree, "outer")?.id).toBe("outer");
  });

  test("returns null for leaves and unknown ids", () => {
    expect(findSplit(leaf("p1"), "x")).toBeNull();
    expect(findSplit(tree, "nope")).toBeNull();
    expect(findSplit(null, "outer")).toBeNull();
  });
});

describe("zoneAt (4-way drop zones)", () => {
  test("center when away from all edges", () => {
    expect(zoneAt(0.5, 0.5)).toBe("center");
    expect(zoneAt(0.4, 0.6)).toBe("center");
  });

  test("edges within the 25% band", () => {
    expect(zoneAt(0.1, 0.5)).toBe("left");
    expect(zoneAt(0.9, 0.5)).toBe("right");
    expect(zoneAt(0.5, 0.1)).toBe("top");
    expect(zoneAt(0.5, 0.9)).toBe("bottom");
  });

  test("nearest edge wins in a corner region", () => {
    expect(zoneAt(0.05, 0.2)).toBe("left");
    expect(zoneAt(0.2, 0.05)).toBe("top");
  });
});

describe("dividerDragWeights", () => {
  // A roomy pair: 1000px split, two equal panes, so 260px of slack either side.
  const roomy = { sizes: [1, 1], index: 0, axisPx: 1000 };

  test("tracks the pointer proportionally inside the legal range", () => {
    const [before, after] = dividerDragWeights(roomy.sizes, roomy.index, roomy.axisPx, 100);
    // 100px of a 1000px axis carrying 2 weight units = 0.2
    expect(before).toBeCloseTo(1.2);
    expect(after).toBeCloseTo(0.8);
  });

  test("holds both panes at MIN_PANE_PX when dragged past the end", () => {
    const [before, after] = dividerDragWeights(roomy.sizes, roomy.index, roomy.axisPx, 10_000);
    // 240/1000 of the axis, in weight units
    expect(before).toBeCloseTo(2 - (MIN_PANE_PX / 1000) * 2);
    expect(after).toBeCloseTo((MIN_PANE_PX / 1000) * 2);
  });

  test("weights always sum to the pair's total, however far the drag goes", () => {
    for (const deltaPx of [-9999, -400, -1, 0, 1, 400, 9999]) {
      const [before, after] = dividerDragWeights([1, 3], 0, 900, deltaPx);
      expect(before + after).toBeCloseTo(4);
    }
  });

  test("only the dragged pair's weights are reported (siblings untouched)", () => {
    // 3 children, drag the second boundary: the pair is children 1 and 2
    const [before, after] = dividerDragWeights([1, 1, 1], 1, 900, 0);
    expect(before + after).toBeCloseTo(2);
  });

  test("a zero-width axis is a no-op rather than NaN", () => {
    expect(dividerDragWeights([1, 1], 0, 0, 50)).toEqual([1, 1]);
  });

  // ── regressions: a pair too small for two MIN_PANE_PX panes ──
  // Three consecutive "Split right" on a 1601px window leaves a 200/200 pair whose
  // split spans 400px. The old clamp inverted there (floor 1.2 above ceiling 0.8):
  // Math.max won, the divider snapped to a fixed weight and stopped tracking the
  // pointer entirely — the reported "middle bar stays put and won't drag the panes".
  test("a cramped pair pins to its midpoint instead of inverting", () => {
    for (const deltaPx of [-200, -40, 0, 40, 200]) {
      const [before, after] = dividerDragWeights([1, 1], 0, 400, deltaPx);
      expect(before).toBeCloseTo(1);
      expect(after).toBeCloseTo(1);
    }
  });

  // One more split (a 180px pair) drove the sibling weight NEGATIVE, which
  // computeLayout renders as a pane overflowing its region and leaving the viewport.
  test("weights never go negative, however cramped the pair", () => {
    for (const axisPx of [400, 300, 180, 90, 12, 1]) {
      for (const deltaPx of [-500, 0, 500]) {
        const [before, after] = dividerDragWeights([1, 1], 0, axisPx, deltaPx);
        expect(before).toBeGreaterThan(0);
        expect(after).toBeGreaterThan(0);
      }
    }
  });
});

describe("canSplit", () => {
  test("needs room for two MIN_PANE_PX panes along the split axis", () => {
    expect(canSplit(MIN_PANE_PX * 2, 100, "row")).toBe(true);
    expect(canSplit(MIN_PANE_PX * 2 - 1, 100, "row")).toBe(false);
    expect(canSplit(100, MIN_PANE_PX * 2, "col")).toBe(true);
    expect(canSplit(100, MIN_PANE_PX * 2 - 1, "col")).toBe(false);
  });

  test("only the split axis matters", () => {
    expect(canSplit(1000, 10, "row")).toBe(true);
    expect(canSplit(10, 1000, "col")).toBe(true);
  });
});

describe("dropZoneFor", () => {
  const roomy = [1000, 1000] as const;
  const narrow = [300, 1000] as const;
  const short = [1000, 300] as const;

  test("keeps an edge zone when the pane can be split that way", () => {
    expect(dropZoneFor("left", ...roomy)).toBe("left");
    expect(dropZoneFor("bottom", ...roomy)).toBe("bottom");
  });

  test("degrades to a replace when the pane has no room to split", () => {
    expect(dropZoneFor("left", ...narrow)).toBe("center");
    expect(dropZoneFor("right", ...narrow)).toBe("center");
    expect(dropZoneFor("top", ...short)).toBe("center");
    expect(dropZoneFor("bottom", ...short)).toBe("center");
  });

  test("a narrow pane can still be split the other way", () => {
    expect(dropZoneFor("top", ...narrow)).toBe("top");
    expect(dropZoneFor("left", ...short)).toBe("left");
  });

  test("center is always center", () => {
    expect(dropZoneFor("center", ...narrow)).toBe("center");
  });
});

// The invariant that actually guards the bug: drag every divider of a deeply nested
// layout to both extremes and no pane may leave its region or the viewport. This is
// what failed before — a 5-pane chain ended with one pane at x = 100%, off-screen and
// unreachable (its close button went with it).
describe("panes stay on screen under any divider drag", () => {
  const VIEWPORT_W = 1601; // the window the bug was reproduced in
  const VIEWPORT_H = 1048;

  // What the split button builds: wrap the newest pane in a binary [1,1] split, so N
  // splits nest N deep and halve the last pane every time.
  const splitChain = (depth: number, dir: "row" | "col"): LayoutNode => {
    let counter = 0;
    let root: LayoutNode = { type: "leaf", paneId: "pane-0" };
    for (let remaining = depth; remaining > 0; remaining--) {
      const newest: string = [...computeLayout(root).paneRects.keys()].pop()!;
      const added: LeafNode = { type: "leaf", paneId: `pane-${++counter}` };
      const wrap = (leaf: LeafNode): SplitNode => ({
        type: "split",
        id: `split-${++counter}`,
        dir,
        children: [leaf, added],
        sizes: [1, 1],
      });
      root =
        root.type === "leaf" && root.paneId === newest
          ? wrap(root)
          : replaceLeaf(root, newest, wrap);
    }
    return root;
  };

  const drag = (root: LayoutNode, d: Divider, deltaPx: number): LayoutNode => {
    const node = findSplit(root, d.nodeId)!;
    const axisPx = (d.dir === "row" ? VIEWPORT_W : VIEWPORT_H) * d.span;
    const [before, after] = dividerDragWeights(node.sizes, d.index, axisPx, deltaPx);
    return mapSplit(root, d.nodeId, (split) => ({
      ...split,
      sizes: split.sizes.map((size, at) =>
        at === d.index ? before : at === d.index + 1 ? after : size,
      ),
    }));
  };

  const expectOnScreen = (root: LayoutNode, label: string) => {
    for (const [paneId, r] of computeLayout(root).paneRects) {
      const where = `${label} / ${paneId}`;
      expect(r.w, `${where} width`).toBeGreaterThan(0);
      expect(r.h, `${where} height`).toBeGreaterThan(0);
      expect(r.x, `${where} left edge`).toBeGreaterThanOrEqual(-1e-9);
      expect(r.y, `${where} top edge`).toBeGreaterThanOrEqual(-1e-9);
      expect(r.x + r.w, `${where} right edge`).toBeLessThanOrEqual(1 + 1e-9);
      expect(r.y + r.h, `${where} bottom edge`).toBeLessThanOrEqual(1 + 1e-9);
    }
  };

  for (const dir of ["row", "col"] as const) {
    for (let depth = 1; depth <= 6; depth++) {
      test(`${depth} nested ${dir} split(s) survive extreme drags`, () => {
        let root = splitChain(depth, dir);
        expectOnScreen(root, `${depth} ${dir} splits, fresh`);

        // hammer every boundary, outermost to innermost, both ways
        for (const deltaPx of [-5000, 5000, -137, 137]) {
          for (const d of computeLayout(root).dividers) {
            root = drag(root, d, deltaPx);
            expectOnScreen(root, `${depth} ${dir} splits, ${d.nodeId} by ${deltaPx}px`);
          }
        }
      });
    }
  }
});
