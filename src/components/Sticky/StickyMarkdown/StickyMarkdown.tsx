import { Show } from "solid-js";
import { StickyNote } from "~/stores/stickyStore";
import { TiptapEditor } from "./TiptapEditor";

import "./sticky-markdown.scss";

type StickyMarkdownProps = {
  sticky: StickyNote;
  editing: boolean;
  onExit: () => void;
  updateContent: (content: string) => void;
};

export const StickyMarkdown = (props: StickyMarkdownProps) => (
  <Show
    when={props.editing}
    fallback={
      // display only — focus/enter-edit is granted by the sticky root pointerdown
      <div class="sticky-markdown rendered" innerHTML={props.sticky.content} />
    }
  >
    <TiptapEditor
      content={props.sticky.content}
      onChange={props.updateContent}
      onExit={props.onExit}
    />
  </Show>
);
