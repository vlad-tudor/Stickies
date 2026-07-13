import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { StickyNote, ensureNoteBody, awarenessFor } from "~/stores/stickyStore";
import { usePane } from "~/stores/workspace/paneContext";
import { MOTION } from "~/utils/motion";
import { TiptapEditor } from "./TiptapEditor";

import "./sticky-markdown.scss";

type StickyMarkdownProps = {
  sticky: StickyNote;
  editing: boolean;
  onExit: () => void;
  updateContent: (content: string) => void;
};

export const StickyMarkdown = (props: StickyMarkdownProps) => {
  const pane = usePane();

  // Keep the editor mounted for MOTION.leave after editing ends, so its toolbar can
  // animate out (`exiting`). The rendered view is pixel-identical, so the final swap
  // is invisible — only the toolbar is seen fading.
  const [showEditor, setShowEditor] = createSignal(props.editing);
  const [exiting, setExiting] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  createEffect(() => {
    if (props.editing) {
      clearTimeout(timer);
      setExiting(false);
      setShowEditor(true);
    } else if (showEditor()) {
      setExiting(true);
      clearTimeout(timer);
      timer = setTimeout(() => {
        setShowEditor(false);
        setExiting(false);
      }, MOTION.leave);
    }
  });
  onCleanup(() => clearTimeout(timer));

  return (
    <Show
      when={showEditor()}
      fallback={
        // display only — focus/enter-edit is granted by the sticky root pointerdown
        <div class="sticky-markdown rendered" innerHTML={props.sticky.content} />
      }
    >
      <TiptapEditor
        content={props.sticky.content}
        fragment={ensureNoteBody(pane.boardId(), props.sticky.id)}
        awareness={awarenessFor(pane.boardId())}
        onChange={props.updateContent}
        onExit={props.onExit}
        exiting={exiting()}
      />
    </Show>
  );
};
