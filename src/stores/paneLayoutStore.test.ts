// Pure layout math of the split tree (rect computation, dividers, drop zones).
// Not touched by the collab rewrite, but load-bearing for every pane feature.
import { test, expect, describe } from "bun:test";
import {
  computeLayout,
  findSplit,
  zoneAt,
  type LayoutNode,
  type SplitNode,
} from "./paneLayoutStore";

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
