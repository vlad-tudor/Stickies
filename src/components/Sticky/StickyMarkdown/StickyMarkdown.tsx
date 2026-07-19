import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import type * as Y from "yjs";
import {
  StickyNote,
  ensureNoteBody,
  noteBodyFragment,
  awarenessFor,
  remoteHoldOn,
  HoldKind,
} from "~/stores/stickyStore";
import { usePane } from "~/stores/workspace/paneContext";
import { MOTION } from "~/utils/motion";
import { TiptapEditor } from "./TiptapEditor";
import { StickyFragmentView } from "./StickyFragmentView";

import "./sticky-markdown.scss";

type StickyMarkdownProps = {
  sticky: StickyNote;
  editing: boolean;
  onExit: () => void;
  updateContent: (content: string) => void;
};

export const StickyMarkdown = (props: StickyMarkdownProps) => {
  const pane = usePane();

  // While a PEER is editing this note (and it's fragment-backed), the non-editing
  // view renders live from the fragment instead of the lagging `content` mirror —
  // showing the converged text plus the peer's caret. Returns the EXISTING
  // fragment only (never creates one — a viewer minting a fragment would collide
  // on the note's body key). undefined → fall back to the static content string.
  const peerEditingFragment = (): Y.XmlFragment | undefined => {
    const hold = remoteHoldOn(pane.boardId(), props.sticky.id);
    if (hold?.kind !== HoldKind.Editing) return undefined;
    return noteBodyFragment(pane.boardId(), props.sticky.id);
  };

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
        <Show
          when={peerEditingFragment()}
          fallback={<div class="sticky-markdown rendered" innerHTML={props.sticky.content} />}
        >
          {(fragment) => (
            <StickyFragmentView fragment={fragment()} awareness={awarenessFor(pane.boardId())} />
          )}
        </Show>
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
