import { createSignal } from "solid-js";

// Board pan/zoom. Applied as a single transform on a viewport wrapper:
//   translate(pan) scale(zoom)   (transform-origin: 0 0)
// Stored sticky positions are NEVER mutated by navigation — only this transform
// changes. Drag/resize deltas divide by zoom; pan is in screen px.

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export const [pan, setPan] = createSignal<{ x: number; y: number }>({ x: 0, y: 0 });
export const [zoom, setZoom] = createSignal(1);

// true while a 2-finger board pinch is active — sticky drag/resize bail so the
// gesture "passes through" the note and zooms/pans the board instead.
export const [isPinching, setIsPinching] = createSignal(false);

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

// ── coordinate transforms (the one definition of the world<->screen mapping) ──
export type Point = { x: number; y: number };

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
