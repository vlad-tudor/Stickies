import { onCleanup, onMount } from "solid-js";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";

import "./markdown.scss";

// We have some themes for you to choose
import "@milkdown/crepe/theme/frame.css";

type MarkdownProps = {
  rootElementRef: HTMLDivElement;
};

export const withMarkdown = ({ rootElementRef }: MarkdownProps) => {
  let crepe!: Crepe;

  crepe = new Crepe({
    root: rootElementRef,
    defaultValue: "Hello, Milkdown!",
  });

  crepe.create();

  //   return <div ref={markdownContainerRef} />;
};
