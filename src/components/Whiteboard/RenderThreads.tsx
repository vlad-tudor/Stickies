import { createMemo, For, Show } from "solid-js";
import { threadAnchor, type StickyNote } from "~/stores/stickyStore";
import { usePane } from "~/stores/paneContext";
import { pendingThread, selectedThread, setSelectedThread, isInteracting } from "~/stores/uiStore";

const VIEW = 32000; // half-span of the svg coord area (matches the grid)

type Rect = { minX: number; minY: number; maxX: number; maxY: number };
type Seg = { tid: string; x1: number; y1: number; x2: number; y2: number };

// Liang–Barsky: param interval [t0,t1] of segment A->B that lies inside the
// rect, or null if it never enters.
function rectInterval(
  ax: number, ay: number, bx: number, by: number, r: Rect
): [number, number] | null {
  const dx = bx - ax;
  const dy = by - ay;
  const p = [-dx, dx, -dy, dy];
  const q = [ax - r.minX, r.maxX - ax, ay - r.minY, r.maxY - ay];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null; // parallel and outside this edge
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0 < t1 ? [t0, t1] : null;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const RenderThreads = () => {
  const pane = usePane();
  const byId = createMemo(() => {
    const m = new Map<string, StickyNote>();
    for (const s of pane.stickies()) m.set(s.id, s);
    return m;
  });

  // Split each thread into gap segments (solid, clickable) and over-note
  // segments (faded). Over-note intensity is constant: drawn once, on top.
  const segs = createMemo(() => {
    const map = byId();

    // During a drag/pan, skip the O(threads × notes) over-note clipping — draw plain
    // straight dot-to-dot lines (cheap, O(threads)). The full clip runs once on settle.
    if (isInteracting()) {
      const gaps: Seg[] = [];
      for (const t of pane.threads()) {
        const a = map.get(t.from);
        const b = map.get(t.to);
        if (!a || !b) continue;
        const p1 = threadAnchor(a);
        const p2 = threadAnchor(b);
        gaps.push({ tid: t.id, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
      }
      return { gaps, over: [] as Seg[] };
    }

    const rects: Rect[] = pane.stickies().map((s) => ({
      minX: s.position[1],
      minY: s.position[0],
      maxX: s.position[1] + s.dimensions[0],
      maxY: s.position[0] + s.dimensions[1],
    }));

    const gaps: Seg[] = [];
    const over: Seg[] = [];
    for (const t of pane.threads()) {
      const a = map.get(t.from);
      const b = map.get(t.to);
      if (!a || !b) continue;
      const p1 = threadAnchor(a);
      const p2 = threadAnchor(b);

      // over-note intervals (merged)
      const ints: [number, number][] = [];
      for (const r of rects) {
        const iv = rectInterval(p1.x, p1.y, p2.x, p2.y, r);
        if (iv) ints.push(iv);
      }
      ints.sort((m, n) => m[0] - n[0]);
      const merged: [number, number][] = [];
      for (const iv of ints) {
        const last = merged[merged.length - 1];
        if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
        else merged.push([iv[0], iv[1]]);
      }

      const push = (arr: Seg[], t0: number, t1: number) =>
        arr.push({
          tid: t.id,
          x1: lerp(p1.x, p2.x, t0),
          y1: lerp(p1.y, p2.y, t0),
          x2: lerp(p1.x, p2.x, t1),
          y2: lerp(p1.y, p2.y, t1),
        });

      // over-note pieces + complementary gaps
      let cursor = 0;
      for (const [t0, t1] of merged) {
        if (t0 > cursor) push(gaps, cursor, t0);
        push(over, t0, t1);
        cursor = Math.max(cursor, t1);
      }
      if (cursor < 1) push(gaps, cursor, 1);
    }
    return { gaps, over };
  });

  // live rubber-band line from the source note's dot to the cursor
  const pendingLine = createMemo(() => {
    const p = pendingThread();
    if (!p) return null;
    const a = byId().get(p.from);
    if (!a) return null;
    const p1 = threadAnchor(a);
    return { x1: p1.x, y1: p1.y, x2: p.to.x, y2: p.to.y };
  });

  return (
    <svg class="thread-layer" viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`}>
      <For each={segs().over}>
        {(s) => (
          <line
            class={`thread-seg faded${selectedThread()?.id === s.tid ? " selected" : ""}`}
            data-tid={s.tid}
            x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
          />
        )}
      </For>
      <For each={segs().gaps}>
        {(s) => (
          <g>
            <line
              class="thread-hit"
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              onClick={(e) => setSelectedThread({ id: s.tid, x: e.clientX, y: e.clientY })}
            />
            <line
              class={`thread-seg${selectedThread()?.id === s.tid ? " selected" : ""}`}
              data-tid={s.tid}
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            />
          </g>
        )}
      </For>
      <Show when={pendingLine()}>
        {(p) => <line class="thread-seg pending" x1={p().x1} y1={p().y1} x2={p().x2} y2={p().y2} />}
      </Show>
    </svg>
  );
};
