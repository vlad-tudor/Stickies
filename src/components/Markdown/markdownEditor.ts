import { Crepe } from "@milkdown/crepe";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { marked } from "marked";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/nord.css";
import "./markdown.scss";

export function renderMarkdown(el: HTMLDivElement, markdown: string): void {
  el.innerHTML = marked(markdown) as string;
}

let activeCrepe: Crepe | undefined;

export async function mountEditor(
  el: HTMLDivElement,
  markdown: string,
  onChange: (md: string) => void,
): Promise<() => Promise<void>> {
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

  return async () => {
    if (activeCrepe === crepe) {
      await crepe.destroy();
      activeCrepe = undefined;
    }
  };
}
