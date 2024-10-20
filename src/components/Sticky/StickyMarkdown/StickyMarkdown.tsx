import { createEffect, createSignal, onMount } from "solid-js";
import {
  loadMarkdownContent,
  startMarkdownEditor,
} from "~/components/Markdown/withMarkdown";
import { StickyNote } from "~/stores/stickyStore";

import "./sticky-markdown.scss";

type StickyMarkdownProps = {
  sticky: StickyNote;
  active: boolean;
  updateStickyMarkdown: (content: string) => void;
};

export const StickyMarkdown = (props: StickyMarkdownProps) => {
  const [initialised, hasInitialised] = createSignal(false);
  let stickyNoteContentRef!: HTMLDivElement;

  createEffect(async () => {
    if (props.active && !initialised()) {
      stickyNoteContentRef.innerHTML = "";
      await startMarkdownEditor({
        rootElementRef: stickyNoteContentRef,
        previousMarkdown: props.sticky.content,
        onMarkdownUpdated: (content) => props.updateStickyMarkdown(content),
      });

      hasInitialised(true);
    } else if (!props.active && initialised()) {
      hasInitialised(false);
    }
  });

  onMount(() => {
    stickyNoteContentRef.innerHTML = "";
    loadMarkdownContent({
      rootElementRef: stickyNoteContentRef,
      previousMarkdown: props.sticky.content,
      onMarkdownUpdated: (content) => props.updateStickyMarkdown(content),
    });
  });

  return (
    <div
      ref={stickyNoteContentRef}
      id={"sticky-markdown-" + props.sticky.id}
      class={`sticky-markdown ${props.active ? "" : "inactive"}`}
      style={{ "pointer-events": props.active ? "all" : "none" }}
    ></div>
  );
};
