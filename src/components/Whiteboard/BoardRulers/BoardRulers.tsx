import { createMemo, For } from "solid-js";
import { useViewport } from "~/stores/viewportStore";

import "./board-rulers.scss";

// Top chrome height in px (tab bar 2.25rem + actions bar 2.5rem = 4.75rem).
// Matches CHROME_TOP in viewportStore / OffscreenIndicators — the visible canvas
// starts here, so the rulers (and their world<->screen math) hang off this line.
const CHROME_TOP = 76;
const TARGET = 90; // aim for ~this many screen px between labeled (major) ticks

// Smallest 1 / 2 / 5 × 10ⁿ that is ≥ raw — keeps tick labels on round numbers.
function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const mult = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return mult * pow;
}

type BoardRulersProps = {
  size: () => { w: number; h: number };
};

// Two thin screen-space rulers (top + left) showing world coordinates, so you can
// see how far the board has been panned from origin. Ticks are tiled gradients
// (no per-tick DOM); only the major-tick labels are elements.
export const BoardRulers = (props: BoardRulersProps) => {
  const vp = useViewport();
  // world units between major (labeled) ticks; minor ticks subdivide by 5
  const major = createMemo(() => niceStep(TARGET / vp.zoom()));

  // visible major-tick world values along each axis (drive the labels)
  const hTicks = createMemo<number[]>(() => {
    const z = vp.zoom(), px = vp.pan().x, w = props.size().w, step = major();
    const out: number[] = [];
    for (let v = Math.ceil(-px / z / step) * step; px + v * z <= w; v += step) out.push(v);
    return out;
  });
  const vTicks = createMemo<number[]>(() => {
    const z = vp.zoom(), py = vp.pan().y, h = props.size().h, step = major();
    const out: number[] = [];
    for (let v = Math.ceil((CHROME_TOP - py) / z / step) * step; py + v * z <= h; v += step) out.push(v);
    return out;
  });

  // Pan so world origin (0,0) lands in the middle of the visible canvas; keep zoom.
  const goToOrigin = () => {
    const { w, h } = props.size();
    vp.setPan({ x: w / 2, y: CHROME_TOP + (h - CHROME_TOP) / 2 });
  };

  return (
    <>
      <div
        class="ruler ruler-h"
        style={{
          // major (taller/stronger) + minor tick periods scale with zoom; the
          // pattern is anchored so a tick sits at screenX = pan.x (world 0).
          "background-size": `${major() * vp.zoom()}px 10px, ${(major() * vp.zoom()) / 5}px 6px`,
          "background-position": `${vp.pan().x}px bottom, ${vp.pan().x}px bottom`,
        }}
      >
        <For each={hTicks()}>
          {(v) => (
            <span
              class={`ruler-label${v === 0 ? " is-origin" : ""}`}
              style={{ left: `${vp.pan().x + v * vp.zoom()}px` }}
            >
              {Math.round(v)}
            </span>
          )}
        </For>
      </div>

      <div
        class="ruler ruler-v"
        style={{
          "background-size": `10px ${major() * vp.zoom()}px, 6px ${(major() * vp.zoom()) / 5}px`,
          "background-position": `right ${vp.pan().y - CHROME_TOP}px, right ${vp.pan().y - CHROME_TOP}px`,
        }}
      >
        <For each={vTicks()}>
          {(v) => (
            <span
              class={`ruler-label${v === 0 ? " is-origin" : ""}`}
              style={{ top: `${vp.pan().y + v * vp.zoom() - CHROME_TOP}px` }}
            >
              {Math.round(v)}
            </span>
          )}
        </For>
      </div>

      <button class="ruler-corner" title="Go to origin" onClick={goToOrigin} />
    </>
  );
};
