// Viewport math contract: the world<->screen mapping, the zoom-anchor
// invariant every pinch/wheel gesture relies on, clamping, and view restore.
// Tween-driven paths (fitView/resetView target animation) are exercised in the
// app; asserting anime.js internals here would test the library, not us.
import { test, expect, describe } from "bun:test";
import { createRoot } from "solid-js";
import { createViewport, type Viewport, type Point } from "./viewportStore";

// Own the viewport's reactive scope so its persistence effect has an owner.
const withViewport = (
  run: (viewport: Viewport) => void,
  persistKey = "test.view",
  origin?: () => Point,
): void => {
  localStorage.clear();
  createRoot((dispose) => {
    run(createViewport(persistKey, origin));
    dispose();
  });
};

describe("coordinate transforms", () => {
  test("worldToScreen and screenToWorld are inverses", () => {
    withViewport((viewport) => {
      viewport.setPan({ x: 50, y: -30 });
      viewport.zoomAt(1.5, 0, 0);
      const world = { x: 123, y: -456 };
      const roundTripped = viewport.screenToWorld(viewport.worldToScreen(world));
      expect(roundTripped.x).toBeCloseTo(world.x);
      expect(roundTripped.y).toBeCloseTo(world.y);
    });
  });

  test("eventToWorld subtracts the pane's screen origin", () => {
    withViewport(
      (viewport) => {
        const paneLocal = viewport.screenToWorld({ x: 0, y: 0 });
        const fromEvent = viewport.eventToWorld({ x: 100, y: 40 });
        expect(fromEvent).toEqual(paneLocal);
      },
      "test.view",
      () => ({ x: 100, y: 40 }),
    );
  });
});

describe("zoomAt", () => {
  test("keeps the anchor point fixed in world space", () => {
    withViewport((viewport) => {
      viewport.setPan({ x: 20, y: 80 });
      const anchor = { x: 300, y: 200 }; // pane-local
      const before = viewport.screenToWorld(anchor);
      viewport.zoomAt(1.4, anchor.x, anchor.y);
      const after = viewport.screenToWorld(anchor);
      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
    });
  });

  test("clamps to the zoom range and no-ops at the limits", () => {
    withViewport((viewport) => {
      viewport.zoomAt(100, 0, 0);
      expect(viewport.zoom()).toBe(2); // MAX
      const panAtMax = viewport.pan();
      viewport.zoomAt(3, 50, 50); // already clamped -> no pan drift
      expect(viewport.pan()).toEqual(panAtMax);
      viewport.zoomAt(0.0001, 0, 0);
      expect(viewport.zoom()).toBe(0.5); // MIN
    });
  });

  test("panBy accumulates deltas", () => {
    withViewport((viewport) => {
      viewport.panBy(10, -5);
      viewport.panBy(-4, 15);
      expect(viewport.pan()).toEqual({ x: 6, y: 10 });
    });
  });
});

describe("view restore", () => {
  test("a saved view restores pan and zoom", () => {
    localStorage.setItem(
      "restore.view",
      JSON.stringify({ pan: { x: 11, y: 22 }, zoom: 1.25 }),
    );
    createRoot((dispose) => {
      const viewport = createViewport("restore.view");
      expect(viewport.pan()).toEqual({ x: 11, y: 22 });
      expect(viewport.zoom()).toBe(1.25);
      dispose();
    });
  });

  test("an out-of-range saved zoom is clamped on restore", () => {
    localStorage.setItem(
      "restore.view",
      JSON.stringify({ pan: { x: 0, y: 0 }, zoom: 99 }),
    );
    createRoot((dispose) => {
      const viewport = createViewport("restore.view");
      expect(viewport.zoom()).toBe(2);
      dispose();
    });
  });

  test("corrupt saved views fall back to the default view", () => {
    localStorage.setItem("restore.view", "not-json{");
    createRoot((dispose) => {
      const viewport = createViewport("restore.view");
      expect(viewport.pan()).toEqual({ x: 0, y: 0 });
      expect(viewport.zoom()).toBe(1);
      dispose();
    });
  });
});
