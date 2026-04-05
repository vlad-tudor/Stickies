import { Show, createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import { untrack } from "solid-js/web";
import { type EditorHandle, mountEditor, renderMarkdown } from "~/components/Markdown/markdownEditor";
import { StickyNote } from "~/stores/stickyStore";

import "./sticky-markdown.scss";

type StickyMarkdownProps = {
  sticky: StickyNote;
  active: boolean;
  rawMode: boolean;
  initialHtml?: string;
  updateStickyMarkdown: (content: string) => void;
};

export const StickyMarkdown = (props: StickyMarkdownProps) => {
  const [editorMounted, setEditorMounted] = createSignal(false);
  let stickyNoteContentRef!: HTMLDivElement;
  let editorHandle: EditorHandle | undefined;

  onMount(() => {
    if (props.initialHtml) {
      stickyNoteContentRef.innerHTML = props.initialHtml;
    } else {
      renderMarkdown(stickyNoteContentRef, props.sticky.content);
    }
  });

  createEffect(() => {
    const isActive = props.active;
    const isRaw = props.rawMode;
    const isMounted = editorMounted();

    if (isRaw) {
      if (isMounted) {
        setEditorMounted(false);
        if (editorHandle) {
          const handle = editorHandle;
          editorHandle = undefined;
          handle.destroy();
        }
      }
      return;
    }

    if (isActive && !isMounted) {
      setEditorMounted(true);
      const content = untrack(() => props.sticky.content);
      mountEditor(stickyNoteContentRef, content, props.updateStickyMarkdown)
        .then((handle) => { editorHandle = handle; });
    } else if (!isActive && isMounted) {
      setEditorMounted(false);
      if (editorHandle) {
        const handle = editorHandle;
        editorHandle = undefined;
        handle.destroy();
      }
    }
  });

  // Re-render HTML when switching from raw back to rendered while inactive
  createEffect(on(() => props.rawMode, (isRaw, prevRaw) => {
    if (prevRaw && !isRaw && !props.active) {
      renderMarkdown(stickyNoteContentRef, props.sticky.content);
    }
  }));

  onCleanup(() => { editorHandle?.destroy(); });

  return (
    <>
      <div
        ref={stickyNoteContentRef}
        id={"sticky-markdown-" + props.sticky.id}
        class={`sticky-markdown ${props.active ? "" : "inactive"}`}
        style={{
          "pointer-events": props.active ? "all" : "none",
          display: props.rawMode ? "none" : undefined,
        }}
      />
      <Show when={props.rawMode}>
        <textarea
          class="sticky-markdown-raw"
          value={props.sticky.content}
          readOnly={!props.active}
          onInput={(e) => props.updateStickyMarkdown(e.currentTarget.value)}
        />
      </Show>
    </>
  );
};
