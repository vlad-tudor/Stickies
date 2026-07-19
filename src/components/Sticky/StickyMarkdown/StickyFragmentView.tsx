import { onCleanup, onMount } from "solid-js";
import { Editor } from "@tiptap/core";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { stickyBodyExtensions } from "./editorExtensions";

type StickyFragmentViewProps = {
  fragment: Y.XmlFragment;
  awareness?: Awareness; // live session — renders the peer's in-body caret
};

// Read-only projection of a note's body fragment, shown while a PEER is editing
// a note we're only viewing. Two wins over the static `content` mirror: it tracks
// the converged fragment live (no mirror-lag beat), and — via awareness — it
// shows the peer's caret where they're typing. Non-interactive (pointer-events
// off in CSS): clicks fall through to the sticky root, which opens our own editor
// (and unmounts this). Never publishes a cursor — it isn't editable and can't focus.
export const StickyFragmentView = (props: StickyFragmentViewProps) => {
  let host!: HTMLDivElement;
  onMount(() => {
    const ed = new Editor({
      element: host,
      editable: false,
      extensions: stickyBodyExtensions({
        fragment: props.fragment,
        awareness: props.awareness,
      }),
      content: undefined, // the fragment is the content source
    });
    onCleanup(() => ed.destroy());
  });
  return <div ref={host} class="sticky-markdown rendered sticky-fragment-view" />;
};
