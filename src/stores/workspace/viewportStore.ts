import {
  createContext,
  createEffect,
  createSignal,
  useContext,
  type Accessor,
} from "solid-js";
import { animate, type JSAnimation } from "animejs";
import { MOTION } from "~/utils/motion";
import { createDebouncedWrite } from "~/utils/debouncedWrite";
import { beginInteraction, endInteraction } from "~/stores/uiStore";

// Board pan/zoom. Applied as a single transform on a viewport wrapper:
//   translate(pan) scale(zoom)   (transform-origin: 0 0)
// Stored sticky positions are NEVER mutated by navigation — only this transform
// changes. Drag/resize deltas divide by zoom; pan is in screen px.
//
// This is a FACTORY (createViewport) + context, NOT a global singleton — each
// board pane owns its own pan/zoom.

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const clampZoom = (value: number): number =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

const CHROME_TOP = 76; // tab + actions bars cover the top; fit frames below them

// View persistence settles later than the store default: pan writes on every
// frame of a glide, so give gestures room to finish.
const VIEW_PERSIST_DELAY_MS = 300;

export type Point = { x: number; y: number };

export type Viewport = {
  pan: Accessor<Point>;
  setPan: (next: Point) => void;
  zoom: Accessor<number>;
  isPinching: Accessor<boolean>;
  setIsPinching: (pinching: boolean) => void;
  panBy: (deltaX: number, deltaY: number) => void;
  zoomAt: (factor: number, anchorX: number, anchorY: number) => void;
  resetView: () => void;
  fitView: (
    rects: { x: number; y: number; w: number; h: number }[],
    view: { w: number; h: number },
  ) => void;
  tweenTo: (pan: Point, zoom: number, duration?: number) => void;
  worldToScreen: (point: Point) => Point;
  screenToWorld: (point: Point) => Point;
  eventToWorld: (point: Point) => Point;
};

const readSavedView = (key: string): { pan: Point; zoom: number } | null => {
  try {
    const raw = localStorage.getItem(key);
    // JSON.parse is untyped; this cast states the persisted view format
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
  origin: Accessor<Point> = () => ({ x: 0, y: 0 }),
): Viewport {
  const saved = readSavedView(persistKey);
  const [pan, setPan] = createSignal<Point>(saved?.pan ?? { x: 0, y: 0 });
  const [zoom, setZoom] = createSignal(clampZoom(saved?.zoom ?? 1));

  // true while a 2-finger board pinch is active — sticky drag/resize bail so the
  // gesture "passes through" the note and zooms/pans the board instead.
  const [isPinching, setIsPinching] = createSignal(false);

  // persist on settle (debounced) — pan changes every drag frame, so never write
  // synchronously per frame. Per-viewport writer, no page-hide flush: a stale
  // view is harmless, and per-pane window listeners would leak.
  const saveView = createDebouncedWrite(
    () => {
      try {
        localStorage.setItem(
          persistKey,
          JSON.stringify({ pan: pan(), zoom: zoom() }),
        );
      } catch {
        /* ignore quota / private-mode failures */
      }
    },
    { delayMs: VIEW_PERSIST_DELAY_MS },
  );
  createEffect(() => {
    pan();
    zoom();
    saveView.schedule();
  });

  // A view tween in flight (centering / fit / reset). Any direct user gesture cancels
  // it so the user always wins.
  let viewTween: JSAnimation | null = null;
  // a running tween holds the interaction pause (overlays go cheap during the glide,
  // then settle once on arrival) — clearing it must always balance that begin.
  const clearTween = (): void => {
    if (viewTween) {
      viewTween = null;
      endInteraction();
    }
  };
  const cancelTween = (): void => {
    if (viewTween) {
      viewTween.cancel();
      clearTween();
    }
  };

  // Smoothly animate pan+zoom to a target instead of snapping (anime.js tweens a plain
  // object; onUpdate writes the signals so the transform follows). Overlays pause for
  // the glide so off-screen markers / thread clipping settle once on arrival.
  const tweenTo = (
    targetPan: Point,
    targetZoom: number,
    duration: number = MOTION.view,
  ): void => {
    cancelTween();
    beginInteraction();
    const animated = { x: pan().x, y: pan().y, zoom: zoom() };
    viewTween = animate(animated, {
      x: targetPan.x,
      y: targetPan.y,
      zoom: clampZoom(targetZoom),
      duration,
      ease: MOTION.ease,
      onUpdate: () => {
        setPan({ x: animated.x, y: animated.y });
        setZoom(animated.zoom);
      },
      onComplete: clearTween,
    });
  };

  const panBy = (deltaX: number, deltaY: number): void => {
    cancelTween();
    const current = pan();
    setPan({ x: current.x + deltaX, y: current.y + deltaY });
  };

  // Multiply zoom by `factor`, keeping the point (anchorX, anchorY) — relative
  // to the pane's top-left — anchored under the cursor.
  const zoomAt = (factor: number, anchorX: number, anchorY: number): void => {
    cancelTween();
    const currentZoom = zoom();
    const nextZoom = clampZoom(currentZoom * factor);
    if (nextZoom === currentZoom) return;
    const ratio = nextZoom / currentZoom;
    const currentPan = pan();
    setPan({
      x: anchorX - (anchorX - currentPan.x) * ratio,
      y: anchorY - (anchorY - currentPan.y) * ratio,
    });
    setZoom(nextZoom);
  };

  const resetView = (): void => {
    tweenTo({ x: 0, y: 0 }, 1);
  };

  // Frame all notes in the viewport: fit the bounding box of `rects` (world coords)
  // into the visible area (below the top chrome), centered. Empty -> reset.
  const fitView = (
    rects: { x: number; y: number; w: number; h: number }[],
    view: { w: number; h: number },
  ): void => {
    if (!rects.length) {
      resetView();
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const rect of rects) {
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.w);
      maxY = Math.max(maxY, rect.y + rect.h);
    }
    const pad = 60;
    const availableWidth = view.w - pad * 2;
    const availableHeight = view.h - CHROME_TOP - pad * 2;
    const boxWidth = maxX - minX || 1;
    const boxHeight = maxY - minY || 1;
    // Fit is zoom-OUT only: never magnify past 100% just because the notes are
    // small/few — that's disorienting. Cap at 1, then clamp to the usual range.
    const targetZoom = clampZoom(
      Math.min(availableWidth / boxWidth, availableHeight / boxHeight, 1),
    );
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    tweenTo(
      {
        x: view.w / 2 - centerX * targetZoom,
        y: CHROME_TOP + (view.h - CHROME_TOP) / 2 - centerY * targetZoom,
      },
      targetZoom,
    );
  };

  // ── coordinate transforms (the one definition of the world<->screen mapping) ──
  const worldToScreen = (point: Point): Point => {
    const scale = zoom();
    const offset = pan();
    return { x: offset.x + point.x * scale, y: offset.y + point.y * scale };
  };

  const screenToWorld = (point: Point): Point => {
    const scale = zoom();
    const offset = pan();
    return { x: (point.x - offset.x) / scale, y: (point.y - offset.y) / scale };
  };

  // Map a raw pointer event's WINDOW coords to world, accounting for the pane's
  // screen offset. Use this for pointer handlers; screenToWorld takes coords that
  // are already pane-local (e.g. a fixed in-pane anchor).
  const eventToWorld = (point: Point): Point =>
    screenToWorld({ x: point.x - origin().x, y: point.y - origin().y });

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
export const registerViewport = (id: string, viewport: Viewport): void => {
  paneViewports.set(id, viewport);
};
export const unregisterViewport = (id: string): void => {
  paneViewports.delete(id);
};
export const getViewport = (id: string): Viewport | undefined =>
  paneViewports.get(id);

// Read the viewport for the current pane. Must be under a <ViewportProvider>.
export function useViewport(): Viewport {
  const viewport = useContext(ViewportContext);
  if (!viewport) throw new Error("useViewport must be used within a <ViewportProvider>");
  return viewport;
}
