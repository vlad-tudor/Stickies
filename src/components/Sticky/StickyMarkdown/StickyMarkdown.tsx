import { Show } from "solid-js";
import { useEditorLifecycle } from "~/hooks/useEditorLifecycle";
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
  let stickyNoteContentRef!: HTMLDivElement;

  useEditorLifecycle({
    el: () => stickyNoteContentRef,
    content: () => props.sticky.content,
    active: () => props.active,
    rawMode: () => props.rawMode,
    initialHtml: props.initialHtml,
    onChange: props.updateStickyMarkdown,
  });

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
