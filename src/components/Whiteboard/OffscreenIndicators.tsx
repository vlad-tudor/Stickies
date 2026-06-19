import { createMemo, For } from "solid-js";
import { stickyCenter } from "~/stores/stickyStore";
import { usePane } from "~/stores/paneContext";
import { useViewport } from "~/stores/viewportStore";
import { toneVar, type Tone } from "~/utils/tones";
import { ChevronRight } from "lucide-static";

const MARGIN = 22; // keep markers off the very edge
const CHROME_TOP = 76; // tab + actions bars cover the top — visible area starts here
const TOP_INSET = 100; // clear those bars (marker is centered on this y)

type Marker = { id: string; x: number; y: number; angle: number; tone: Tone; dist: number };

export const OffscreenIndicators = (props: { size: () => { w: number; h: number } }) => {
  const vp = useViewport();
  const pane = usePane();
  const markers = createMemo<Marker[]>(() => {
    const { w, h } = props.size();
    const cxv = w / 2;
    const cyv = h / 2;
    const out: Marker[] = [];
    for (const s of pane.stickies()) {
      // note's rect in screen space
      const tl = vp.worldToScreen({ x: s.position[1], y: s.position[0] });
      const br = vp.worldToScreen({
        x: s.position[1] + s.dimensions[0],
        y: s.position[0] + s.dimensions[1],
      });
      // ENTIRE note outside the visible area (top boundary = toolbar bottom)
      const fullyOff = br.x < 0 || tl.x > w || br.y < CHROME_TOP || tl.y > h;
      if (!fullyOff) continue;

      const c = vp.worldToScreen(stickyCenter(s)); // note's center in screen space
      out.push({
        id: s.id,
        x: Math.max(MARGIN, Math.min(w - MARGIN, c.x)),
        y: Math.max(TOP_INSET, Math.min(h - MARGIN, c.y)),
        angle: (Math.atan2(c.y - cyv, c.x - cxv) * 180) / Math.PI,
        tone: s.color,
        dist: Math.hypot(c.x - cxv, c.y - cyv),
      });
    }
    // farthest first so the CLOSER note's chevron paints on top when they overlap
    out.sort((a, b) => b.dist - a.dist);
    return out;
  });

  // Pan (keeping zoom) so the note's center lands in the middle of the board.
  const centerOn = (id: string) => {
    const s = pane.stickies().find((x) => x.id === id);
    if (!s) return;
    const { w, h } = props.size();
    const z = vp.zoom();
    const c = stickyCenter(s);
    vp.setPan({ x: w / 2 - c.x * z, y: h / 2 - c.y * z });
  };

  return (
    <For each={markers()}>
      {(m) => (
        <button
          class="offscreen-indicator"
          style={{ left: `${m.x}px`, top: `${m.y}px`, background: toneVar(m.tone) }}
          title="Jump to off-screen note"
          onClick={() => centerOn(m.id)}
        >
          <span
            class="arrow"
            style={{ transform: `rotate(${m.angle}deg)` }}
            innerHTML={ChevronRight}
          />
        </button>
      )}
    </For>
  );
};
