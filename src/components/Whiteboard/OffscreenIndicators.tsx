import { createMemo, For } from "solid-js";
import { stickies } from "~/stores/stickyStore";
import { pan, zoom, setPan } from "~/stores/viewportStore";

const MARGIN = 22; // keep markers off the very edge
const TOP_INSET = 100; // clear the tab + actions bars (marker is centered on this y)

type Marker = { id: string; x: number; y: number; angle: number };

// World center of a sticky. position = [top, left], dimensions = [width, height].
const worldCenter = (s: { position: [number, number]; dimensions: [number, number] }) => ({
  x: s.position[1] + s.dimensions[0] / 2,
  y: s.position[0] + s.dimensions[1] / 2,
});

export const OffscreenIndicators = (props: { size: () => { w: number; h: number } }) => {
  const markers = createMemo<Marker[]>(() => {
    const { w, h } = props.size();
    const z = zoom();
    const p = pan();
    const cxv = w / 2;
    const cyv = h / 2;
    const out: Marker[] = [];
    for (const s of stickies()) {
      // screen-space rect of the whole note
      const left = p.x + s.position[1] * z;
      const top = p.y + s.position[0] * z;
      const right = left + s.dimensions[0] * z;
      const bottom = top + s.dimensions[1] * z;
      // only when the ENTIRE note is outside the viewport (no intersection)
      const fullyOff = right < 0 || left > w || bottom < 0 || top > h;
      if (!fullyOff) continue;

      const c = worldCenter(s);
      const sx = p.x + c.x * z; // screen position of the note's center
      const sy = p.y + c.y * z;
      out.push({
        id: s.id,
        x: Math.max(MARGIN, Math.min(w - MARGIN, sx)),
        y: Math.max(TOP_INSET, Math.min(h - MARGIN, sy)),
        angle: (Math.atan2(sy - cyv, sx - cxv) * 180) / Math.PI,
      });
    }
    return out;
  });

  // Pan (keeping zoom) so the note's center lands in the middle of the board.
  const centerOn = (id: string) => {
    const s = stickies().find((x) => x.id === id);
    if (!s) return;
    const { w, h } = props.size();
    const z = zoom();
    const c = worldCenter(s);
    setPan({ x: w / 2 - c.x * z, y: h / 2 - c.y * z });
  };

  return (
    <For each={markers()}>
      {(m) => (
        <button
          class="offscreen-indicator"
          style={{ left: `${m.x}px`, top: `${m.y}px` }}
          title="Jump to off-screen note"
          onClick={() => centerOn(m.id)}
        >
          <span class="arrow" style={{ transform: `rotate(${m.angle}deg)` }} />
        </button>
      )}
    </For>
  );
};
