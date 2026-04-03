import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { untrack } from "solid-js/web";
import { mountEditor, renderMarkdown } from "~/components/Markdown/markdownEditor";
import { StickyNote } from "~/stores/stickyStore";

import "./sticky-markdown.scss";

type StickyMarkdownProps = {
  sticky: StickyNote;
  active: boolean;
  updateStickyMarkdown: (content: string) => void;
};

export const StickyMarkdown = (props: StickyMarkdownProps) => {
  const [editorMounted, setEditorMounted] = createSignal(false);
  let stickyNoteContentRef!: HTMLDivElement;
  let currentDestroy: (() => Promise<void>) | undefined;

  onMount(() => {
    renderMarkdown(stickyNoteContentRef, props.sticky.content);
  });

  createEffect(() => {
    const isActive = props.active;
    const isMounted = editorMounted();

    if (isActive && !isMounted) {
      setEditorMounted(true);
      const content = untrack(() => props.sticky.content);
      mountEditor(stickyNoteContentRef, content, props.updateStickyMarkdown)
        .then((destroy) => { currentDestroy = destroy; });
    } else if (!isActive && isMounted) {
      setEditorMounted(false);
      if (currentDestroy) {
        const destroy = currentDestroy;
        currentDestroy = undefined;
        const content = untrack(() => props.sticky.content);
        destroy().then(() => renderMarkdown(stickyNoteContentRef, content));
      }
    }
  });

  onCleanup(() => { currentDestroy?.(); });

  return (
    <div
      ref={stickyNoteContentRef}
      id={"sticky-markdown-" + props.sticky.id}
      class={`sticky-markdown ${props.active ? "" : "inactive"}`}
      style={{ "pointer-events": props.active ? "all" : "none" }}
    />
  );
};
