import { createEffect, createSignal } from "solid-js";
import {
  MarkdownProps,
  withMarkdownRecurse,
} from "~/components/Markdown/withMarkdown";
import { StickyNote } from "~/stores/stickyStore";

type StickyMarkdownProps = {
  sticky: StickyNote;
  active: boolean;
  updateStickyMarkdown: (content: string) => void;
};

export const StickyMarkdown = (props: StickyMarkdownProps) => {
  const [initialised, hasInitialised] = createSignal(false);
  let stickyNoteContentRef!: HTMLDivElement;

  let starMarkdown = async (markdownProps: MarkdownProps) => {
    starMarkdown = await withMarkdownRecurse(markdownProps);
    return starMarkdown;
  };

  createEffect(async () => {
    if (props.active && !initialised()) {
      await initialiseStickyMarkdown();
      hasInitialised(true);
    } else if (!props.active && initialised()) {
      hasInitialised(false);
    }
  });

  const initialiseStickyMarkdown = async () => {
    stickyNoteContentRef.innerHTML = "";
    await starMarkdown({
      rootElementRef: stickyNoteContentRef,
      previousMarkdown: props.sticky.content,
      onMarkdownUpdated: (content) => props.updateStickyMarkdown(content),
    });

    /**
     * @note this puts the cursor at the top of the editor.
     * @note this is a hack to focus the editor when it's initialised.
     * I'm sure there's a better way to do this using the ProseMirror API.
     */
    stickyNoteContentRef
      .querySelector<HTMLElement>(".ProseMirror.editor")
      ?.focus();
  };

  return (
    <div
      ref={stickyNoteContentRef}
      id={"sticky-markdown-" + props.sticky.id}
      class="sticky-markdown"
      style={{ "pointer-events": props.active ? "all" : "none" }}
    ></div>
  );
};
