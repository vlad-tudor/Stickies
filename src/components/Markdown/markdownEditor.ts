import { Crepe } from "@milkdown/crepe";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { replaceAll } from "@milkdown/utils";
import { marked } from "marked";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/nord.css";
import "./markdown.scss";

export function renderMarkdown(el: HTMLDivElement, markdown: string): void {
  el.innerHTML = marked(markdown) as string;
}

// Render-only features: disable all interactive UI plugins that contribute nothing
// to the static HTML but trigger the RAF destroy bug.
const preRenderFeatures = {
  [Crepe.Feature.BlockEdit]: false,
  [Crepe.Feature.Toolbar]: false,
  [Crepe.Feature.LinkTooltip]: false,
  [Crepe.Feature.Cursor]: false,
  [Crepe.Feature.Placeholder]: false,
} as const;

export async function preRenderAll(
  stickies: Array<{ id: string; content: string }>,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  if (stickies.length === 0) return results;

  const offscreen = document.createElement("div");
  offscreen.style.position = "fixed";
  offscreen.style.left = "-9999px";
  offscreen.style.opacity = "0";
  offscreen.style.pointerEvents = "none";
  document.body.appendChild(offscreen);

  const crepe = new Crepe({
    root: offscreen,
    features: preRenderFeatures,
    defaultValue: stickies[0].content,
  });

  await crepe.create();
  results.set(stickies[0].id, offscreen.innerHTML);

  for (let i = 1; i < stickies.length; i++) {
    crepe.editor.action(replaceAll(stickies[i].content));
    results.set(stickies[i].id, offscreen.innerHTML);
  }

  await crepe.destroy();
  document.body.removeChild(offscreen);

  return results;
}

export type EditorHandle = {
  destroy: () => Promise<void>;
};

let activeCrepe: Crepe | undefined;

export async function mountEditor(
  el: HTMLDivElement,
  markdown: string,
  onChange: (md: string) => void,
): Promise<EditorHandle> {
  if (activeCrepe) {
    await activeCrepe.destroy();
    activeCrepe = undefined;
  }

  el.innerHTML = "";

  const crepe = new Crepe({
    root: el,
    features: {},
    defaultValue: markdown,
    featureConfigs: {
      [Crepe.Feature.Placeholder]: { text: "..." },
    },
  });

  crepe.editor.use(listener);
  crepe.editor.config((ctx) => {
    ctx.get(listenerCtx).markdownUpdated((_ctx, md) => onChange(md));
  });

  await crepe.create();
  activeCrepe = crepe;

  return {
    destroy: async () => {
      const snapshot = el.innerHTML;
      if (activeCrepe === crepe) {
        await crepe.destroy();
        activeCrepe = undefined;
      }

      el.innerHTML = snapshot;
    },
  };
}
