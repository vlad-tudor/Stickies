import { Crepe } from "@milkdown/crepe";

import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";

import "@milkdown/crepe/theme/common/style.css";
// We have some themes for you to choose
import "@milkdown/crepe/theme/nord.css";

import "./markdown.scss";

type MarkdownProps = {
  rootElementRef: HTMLDivElement;

  /**
   * Usually whatever is saved gets here. Perhaps a default of 'start typing here' or something.
   */
  previousMarkdown?: string;
  onMarkdownUpdated: (markdown: string) => void;
};

export const withMarkdown = ({
  previousMarkdown,
  rootElementRef,
  onMarkdownUpdated,
}: MarkdownProps) => {
  let crepe!: Crepe;

  crepe = new Crepe({
    root: rootElementRef,
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

  crepe.create();
};
