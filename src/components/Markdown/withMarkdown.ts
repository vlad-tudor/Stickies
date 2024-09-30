import { Crepe } from "@milkdown/crepe";

import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/nord.css";

import "./markdown.scss";

export type MarkdownProps = {
  rootElementRef: HTMLDivElement;
  previousMarkdown?: string;
  onMarkdownUpdated: (markdown: string) => void;
};

export const withMarkdownRecurse = async ({
  previousMarkdown,
  rootElementRef,
  onMarkdownUpdated,
}: MarkdownProps) => {
  const crepe = new Crepe({
    root: rootElementRef,
    features: {},
    defaultValue: previousMarkdown,
    featureConfigs: {
      [Crepe.Feature.Placeholder]: {
        text: "...",
      },
    },
  });

  crepe.editor.use(listener);
  crepe.editor.config((ctx) => {
    ctx
      .get(listenerCtx)
      .markdownUpdated((ctx, markdown) => onMarkdownUpdated(markdown));
  });

  await crepe.create();

  return async (props: MarkdownProps) => {
    await crepe.destroy();
    return withMarkdownRecurse(props);
  };
};
