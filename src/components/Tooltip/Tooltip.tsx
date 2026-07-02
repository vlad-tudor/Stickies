import { createSignal, onCleanup, onMount, Show } from "solid-js";

import "./tooltip.scss";

type Tip = { text: string; x: number; y: number; below: boolean };

// One delegated tooltip for the whole app: on pointer hover/focus of any element with a
// `title`, show a themed chip and suppress the native tooltip (temporarily removing the
// attribute, restored on leave). Pointer-only — skips touch, where there is no hover.
export const Tooltip = () => {
  const [tip, setTip] = createSignal<Tip | null>(null);
  let current: HTMLElement | null = null;
  let stashed: string | null = null;

  const hide = () => {
    if (current && stashed !== null) current.setAttribute("title", stashed); // restore native
    current = null;
    stashed = null;
    setTip(null);
  };

  const show = (el: HTMLElement) => {
    const text = el.getAttribute("title");
    if (!text) return;
    current = el;
    stashed = text;
    el.removeAttribute("title"); // suppress the browser's own tooltip
    const r = el.getBoundingClientRect();
    const below = r.top < 56; // no room above (under the top bars) → flip below
    setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
  };

  onMount(() => {
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return; // hover affordance only
      if (current && current.contains(e.target as Node)) return; // still inside current
      const el = (e.target as HTMLElement)?.closest<HTMLElement>("[title]");
      if (!el) {
        if (current) hide();
        return;
      }
      if (el !== current) {
        hide();
        show(el);
      }
    };
    const onOut = (e: PointerEvent) => {
      if (current && !current.contains(e.relatedTarget as Node | null)) hide();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("pointerdown", hide, true); // any press dismisses
    window.addEventListener("blur", hide);
    onCleanup(() => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("pointerdown", hide, true);
      window.removeEventListener("blur", hide);
      hide();
    });
  });

  return (
    <Show when={tip()}>
      {(t) => (
        <div
          class={`app-tooltip ${t().below ? "below" : "above"}`}
          style={{ left: `${t().x}px`, top: `${t().y}px` }}
        >
          {t().text}
        </div>
      )}
    </Show>
  );
};
