import { createEffect, createRoot, createSignal } from "solid-js";

// Board pan/zoom. Applied as a single transform on a viewport wrapper:
//   translate(pan) scale(zoom)   (transform-origin: 0 0)
// Stored sticky positions are NEVER mutated by navigation — only this transform
// changes. Drag/resize deltas divide by zoom; pan is in screen px.

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

const CHROME_TOP = 76; // tab + actions bars cover the top; fit frames below them

export type Point = { x: number; y: number };

// last view is persisted (debounced) so a reload restores where you were
const VIEW_KEY = "stickies.view";
const savedView = ((): { pan: Point; zoom: number } | null => {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    return raw ? (JSON.parse(raw) as { pan: Point; zoom: number }) : null;
  } catch {
    return null;
  }
})();

export const [pan, setPan] = createSignal<Point>(savedView?.pan ?? { x: 0, y: 0 });
export const [zoom, setZoom] = createSignal(clampZoom(savedView?.zoom ?? 1));

// true while a 2-finger board pinch is active — sticky drag/resize bail so the
// gesture "passes through" the note and zooms/pans the board instead.
export const [isPinching, setIsPinching] = createSignal(false);

// persist on settle (debounced) — pan changes every drag frame, so never write
// synchronously per frame.
createRoot(() => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    const p = pan();
    const z = zoom();
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem(VIEW_KEY, JSON.stringify({ pan: p, zoom: z }));
      } catch {
        /* ignore quota / private-mode failures */
      }
    }, 300);
  });
});

export function panBy(dx: number, dy: number): void {
  const p = pan();
  setPan({ x: p.x + dx, y: p.y + dy });
}

// Multiply zoom by `factor`, keeping the point (cx, cy) — relative to the board's
// top-left — anchored under the cursor.
export function zoomAt(factor: number, cx: number, cy: number): void {
  const z = zoom();
  const nz = clampZoom(z * factor);
  if (nz === z) return;
  const ratio = nz / z;
  const p = pan();
  setPan({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio });
  setZoom(nz);
}

export function resetView(): void {
  setPan({ x: 0, y: 0 });
  setZoom(1);
}

// Frame all notes in the viewport: fit the bounding box of `rects` (world coords)
// into the visible area (below the top chrome), centered. Empty -> reset.
export function fitView(
  rects: { x: number; y: number; w: number; h: number }[],
  view: { w: number; h: number }
): void {
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
  setZoom(z);
  setPan({
    x: view.w / 2 - cx * z,
    y: CHROME_TOP + (view.h - CHROME_TOP) / 2 - cy * z,
  });
}

// ── coordinate transforms (the one definition of the world<->screen mapping) ──
export const worldToScreen = (p: Point): Point => {
  const z = zoom();
  const o = pan();
  return { x: o.x + p.x * z, y: o.y + p.y * z };
};

export const screenToWorld = (p: Point): Point => {
  const z = zoom();
  const o = pan();
  return { x: (p.x - o.x) / z, y: (p.y - o.y) / z };
};
