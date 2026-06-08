import { createMemo, For, Show } from "solid-js";
import { stickies, threads, deleteThread, type StickyNote } from "~/stores/stickyStore";
import { pendingThread } from "~/stores/uiStore";

const BAND_HALF = 16; // band center (where the connect dot sits), world px

// Thread anchor = the connect dot: horizontal center, vertical middle of the band.
const anchor = (s: StickyNote) => ({
  x: s.position[1] + s.dimensions[0] / 2,
  y: s.position[0] + BAND_HALF,
});

type Line = { id: string; x: number; y: number; len: number; angle: number };

export const RenderThreads = () => {
  const byId = createMemo(() => {
    const m = new Map<string, StickyNote>();
    for (const s of stickies()) m.set(s.id, s);
    return m;
  });

  const lines = createMemo<Line[]>(() => {
    const map = byId();
    const out: Line[] = [];
    for (const t of threads()) {
      const a = map.get(t.from);
      const b = map.get(t.to);
      if (!a || !b) continue;
      const p1 = anchor(a);
      const p2 = anchor(b);
      out.push({
        id: t.id,
        x: p1.x,
        y: p1.y,
        len: Math.hypot(p2.x - p1.x, p2.y - p1.y),
        angle: (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI,
      });
    }
    return out;
  });

  // live rubber-band line from the source note's edge to the cursor
  const pending = createMemo(() => {
    const p = pendingThread();
    if (!p) return null;
    const a = byId().get(p.from);
    if (!a) return null;
    const p1 = anchor(a);
    return {
      x: p1.x,
      y: p1.y,
      len: Math.hypot(p.to.x - p1.x, p.to.y - p1.y),
      angle: (Math.atan2(p.to.y - p1.y, p.to.x - p1.x) * 180) / Math.PI,
    };
  });

  return (
    <>
      <For each={lines()}>
        {(l) => (
          <div
            class="thread"
            style={{
              left: `${l.x}px`,
              top: `${l.y - 6}px`,
              width: `${l.len}px`,
              transform: `rotate(${l.angle}deg)`,
            }}
            title="Click to remove link"
            onClick={() => deleteThread(l.id)}
          />
        )}
      </For>

      <Show when={pending()}>
        {(p) => (
          <div
            class="thread pending"
            style={{
              left: `${p().x}px`,
              top: `${p().y - 6}px`,
              width: `${p().len}px`,
              transform: `rotate(${p().angle}deg)`,
              "z-index": "99999", // rubber-band stays on top of all notes
            }}
          />
        )}
      </Show>
    </>
  );
};
