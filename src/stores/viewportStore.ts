import {
  createContext,
  createEffect,
  createSignal,
  useContext,
  type Accessor,
} from "solid-js";
import { animate, type JSAnimation } from "animejs";
import { MOTION } from "~/utils/motion";

// Board pan/zoom. Applied as a single transform on a viewport wrapper:
//   translate(pan) scale(zoom)   (transform-origin: 0 0)
// Stored sticky positions are NEVER mutated by navigation — only this transform
// changes. Drag/resize deltas divide by zoom; pan is in screen px.
//
// This is a FACTORY (createViewport) + context, NOT a global singleton, so each
// board pane can own its own pan/zoom. Today there's one pane (Whiteboard creates
// one and provides it); the eventual split-view manager creates one per pane.
// NOTE for split-view: screen<->world here assumes the pane fills the window from
// (0,0). Once panes are offset on screen, the conversions need the pane's rect —
// that offset belongs here (and the chrome math), not scattered in callers.

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

const CHROME_TOP = 76; // tab + actions bars cover the top; fit frames below them

export type Point = { x: number; y: number };

export type Viewport = {
  pan: Accessor<Point>;
  setPan: (p: Point) => void;
  zoom: Accessor<number>;
  isPinching: Accessor<boolean>;
  setIsPinching: (v: boolean) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (factor: number, cx: number, cy: number) => void;
  resetView: () => void;
  fitView: (
    rects: { x: number; y: number; w: number; h: number }[],
    view: { w: number; h: number }
  ) => void;
  tweenTo: (pan: Point, zoom: number, duration?: number) => void;
  worldToScreen: (p: Point) => Point;
  screenToWorld: (p: Point) => Point;
  eventToWorld: (p: Point) => Point;
};

const readSavedView = (key: string): { pan: Point; zoom: number } | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { pan: Point; zoom: number }) : null;
  } catch {
    return null;
  }
};

// Create an independent viewport (pan/zoom + transforms). `persistKey` is where its
// last view is saved (debounced) so a reload restores where you were. Call inside a
// reactive owner (a component) — the persistence effect is owned by that scope.
export function createViewport(
  persistKey = "stickies.view",
  // the pane's top-left in window coords — lets eventToWorld() map raw pointer
  // events into this pane. Defaults to (0,0) (a pane that fills the window).
  origin: Accessor<Point> = () => ({ x: 0, y: 0 })
): Viewport {
  const saved = readSavedView(persistKey);
  const [pan, setPan] = createSignal<Point>(saved?.pan ?? { x: 0, y: 0 });
  const [zoom, setZoom] = createSignal(clampZoom(saved?.zoom ?? 1));

  // true while a 2-finger board pinch is active — sticky drag/resize bail so the
  // gesture "passes through" the note and zooms/pans the board instead.
  const [isPinching, setIsPinching] = createSignal(false);

  // persist on settle (debounced) — pan changes every drag frame, so never write
  // synchronously per frame.
  let timer: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    const p = pan();
    const z = zoom();
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem(persistKey, JSON.stringify({ pan: p, zoom: z }));
      } catch {
        /* ignore quota / private-mode failures */
      }
    }, 300);
  });

  // A view tween in flight (centering / fit / reset). Any direct user gesture cancels
  // it so the user always wins.
  let viewTween: JSAnimation | null = null;
  const cancelTween = (): void => {
    if (viewTween) {
      viewTween.cancel();
      viewTween = null;
    }
  };

  // Smoothly animate pan+zoom to a target instead of snapping (anime.js tweens a plain
  // object; onUpdate writes the signals so the transform follows).
  const tweenTo = (targetPan: Point, targetZoom: number, duration: number = MOTION.view): void => {
    cancelTween();
    const o = { x: pan().x, y: pan().y, z: zoom() };
    viewTween = animate(o, {
      x: targetPan.x,
      y: targetPan.y,
      z: clampZoom(targetZoom),
      duration,
      ease: MOTION.ease,
      onUpdate: () => {
        setPan({ x: o.x, y: o.y });
        setZoom(o.z);
      },
      onComplete: () => {
        viewTween = null;
      },
    });
  };

  const panBy = (dx: number, dy: number): void => {
    cancelTween();
    const p = pan();
    setPan({ x: p.x + dx, y: p.y + dy });
  };

  // Multiply zoom by `factor`, keeping the point (cx, cy) — relative to the pane's
  // top-left — anchored under the cursor.
  const zoomAt = (factor: number, cx: number, cy: number): void => {
    cancelTween();
    const z = zoom();
    const nz = clampZoom(z * factor);
    if (nz === z) return;
    const ratio = nz / z;
    const p = pan();
    setPan({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio });
    setZoom(nz);
  };

  const resetView = (): void => {
    tweenTo({ x: 0, y: 0 }, 1);
  };

  // Frame all notes in the viewport: fit the bounding box of `rects` (world coords)
  // into the visible area (below the top chrome), centered. Empty -> reset.
  const fitView = (
    rects: { x: number; y: number; w: number; h: number }[],
    view: { w: number; h: number }
  ): void => {
    if (!rects.length) {
      resetView();
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of rects) {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    const pad = 60;
    const availW = view.w - pad * 2;
    const availH = view.h - CHROME_TOP - pad * 2;
    const bw = maxX - minX || 1;
    const bh = maxY - minY || 1;
    // Fit is zoom-OUT only: never magnify past 100% just because the notes are
    // small/few — that's disorienting. Cap at 1, then clamp to the usual range.
    const z = clampZoom(Math.min(availW / bw, availH / bh, 1));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    tweenTo(
      { x: view.w / 2 - cx * z, y: CHROME_TOP + (view.h - CHROME_TOP) / 2 - cy * z },
      z
    );
  };

  // ── coordinate transforms (the one definition of the world<->screen mapping) ──
  const worldToScreen = (p: Point): Point => {
    const z = zoom();
    const o = pan();
    return { x: o.x + p.x * z, y: o.y + p.y * z };
  };

  const screenToWorld = (p: Point): Point => {
    const z = zoom();
    const o = pan();
    return { x: (p.x - o.x) / z, y: (p.y - o.y) / z };
  };

  // Map a raw pointer event's WINDOW coords to world, accounting for the pane's
  // screen offset. Use this for pointer handlers; screenToWorld takes coords that
  // are already pane-local (e.g. a fixed in-pane anchor).
  const eventToWorld = (p: Point): Point =>
    screenToWorld({ x: p.x - origin().x, y: p.y - origin().y });

  return {
    pan,
    setPan,
    zoom,
    isPinching,
    setIsPinching,
    panBy,
    zoomAt,
    resetView,
    fitView,
    tweenTo,
    worldToScreen,
    screenToWorld,
    eventToWorld,
  };
}

const ViewportContext = createContext<Viewport>();

export const ViewportProvider = ViewportContext.Provider;

// Registry of live pane viewports by pane id — lets a cross-pane drop resolve the
// TARGET pane's world coords (its viewport lives in its own component).
const paneViewports = new Map<string, Viewport>();
export const registerViewport = (id: string, vp: Viewport): void => {
  paneViewports.set(id, vp);
};
export const unregisterViewport = (id: string): void => {
  paneViewports.delete(id);
};
export const getViewport = (id: string): Viewport | undefined => paneViewports.get(id);

// Read the viewport for the current pane. Must be under a <ViewportProvider>.
export function useViewport(): Viewport {
  const vp = useContext(ViewportContext);
  if (!vp) throw new Error("useViewport must be used within a <ViewportProvider>");
  return vp;
}
