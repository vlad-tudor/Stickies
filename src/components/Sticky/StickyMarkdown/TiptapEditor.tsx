import { createEffect, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import { animate } from "animejs";
import { Editor } from "@tiptap/core";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  SquareCode,
  Table as TableIcon,
} from "lucide-static";
import { setActiveEditor, bumpEditorTick } from "~/stores/editorStore";
import { MOTION } from "~/utils/motion";
import { stickyBodyExtensions } from "./editorExtensions";

type TiptapEditorProps = {
  content: string;
  // the note's shared body fragment — when present, the editor binds to it
  // (character-level co-editing) and `content` only seeds a still-empty one
  fragment?: Y.XmlFragment;
  // the live session's awareness — enables in-editor peer carets
  awareness?: Awareness;
  onChange: (html: string) => void;
  onExit: () => void;
  exiting?: boolean; // editing has ended; play the toolbar out-animation before unmount
};

export const TiptapEditor = (props: TiptapEditorProps) => {
  let host!: HTMLDivElement;
  let toolbarEl: HTMLDivElement | undefined;
  const [editor, setEditor] = createSignal<Editor>();
  const [tick, setTick] = createSignal(0); // bumped per transaction to refresh toolbar state

  // Out (exit) / back-in (re-enter within the grace window). Initial in is played by the
  // toolbar's ref on mount; defer skips this on first run so they don't double up.
  createEffect(
    on(
      () => props.exiting,
      (exiting) => {
        if (!toolbarEl) return;
        animate(
          toolbarEl,
          exiting
            ? { opacity: 0, translateY: -6, duration: MOTION.leave, ease: "inQuad" }
            : { opacity: 1, translateY: 0, duration: MOTION.enter, ease: "outCubic" },
        );
      },
      { defer: true },
    ),
  );

  onMount(() => {
    const fragment = props.fragment;

    // Fragment-backed notes bind to the collaboration extensions (the fragment is
    // the content source, never the HTML string; carets ride awareness when live).
    const ed = new Editor({
      element: host,
      extensions: stickyBodyExtensions({ fragment, awareness: props.awareness }),
      content: fragment ? undefined : props.content || "",
      editorProps: {
        handleKeyDown: (_view, event) => {
          if (event.key === "Escape") {
            props.onExit();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => props.onChange(editor.getHTML()),
      onSelectionUpdate: () => {
        setTick((t) => t + 1);
        bumpEditorTick();
      },
      onTransaction: () => {
        setTick((t) => t + 1);
        bumpEditorTick();
      },
    });
    // First edit of a legacy note: its fragment was just created empty — seed
    // it from the mirrored HTML (becomes part of the shared history; safe from
    // double-seeding because fragment creation is hold-guarded upstream).
    if (fragment && fragment.length === 0 && props.content) {
      ed.commands.setContent(props.content, false);
    }
    ed.commands.focus("end");
    setEditor(ed);
    setActiveEditor(ed); // expose to sticky-level chrome (the table strip)
    onCleanup(() => {
      ed.destroy();
      setActiveEditor((cur) => (cur === ed ? null : cur));
    });
  });

  const active = (name: string, attrs?: Record<string, unknown>): boolean => {
    tick(); // subscribe to transactions
    return editor()?.isActive(name, attrs) ?? false;
  };
  const cls = (on: boolean) => `sticky-tool${on ? " is-active" : ""}`;

  return (
    <div class="sticky-editor">
      <Show when={editor()}>
        {(ed) => (
          // preventDefault on mousedown keeps editor focus while clicking buttons
          <div
            class="sticky-toolbar"
            ref={(el) => {
              toolbarEl = el;
              animate(el, {
                opacity: [0, 1],
                translateY: [-6, 0],
                duration: MOTION.enter,
                ease: "outCubic",
              });
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <button
              class={cls(active("bold"))}
              title="Bold"
              onClick={() => ed().chain().focus().toggleBold().run()}
              innerHTML={Bold}
            />
            <button
              class={cls(active("italic"))}
              title="Italic"
              onClick={() => ed().chain().focus().toggleItalic().run()}
              innerHTML={Italic}
            />
            <button
              class={cls(active("underline"))}
              title="Underline"
              onClick={() => ed().chain().focus().toggleUnderline().run()}
              innerHTML={UnderlineIcon}
            />
            <button
              class={cls(active("heading", { level: 1 }))}
              title="Heading 1"
              onClick={() => ed().chain().focus().toggleHeading({ level: 1 }).run()}
              innerHTML={Heading1}
            />
            <button
              class={cls(active("heading", { level: 2 }))}
              title="Heading 2"
              onClick={() => ed().chain().focus().toggleHeading({ level: 2 }).run()}
              innerHTML={Heading2}
            />
            <button
              class={cls(active("bulletList"))}
              title="Bullet list"
              onClick={() => ed().chain().focus().toggleBulletList().run()}
              innerHTML={List}
            />
            <button
              class={cls(active("orderedList"))}
              title="Numbered list"
              onClick={() => ed().chain().focus().toggleOrderedList().run()}
              innerHTML={ListOrdered}
            />
            <button
              class={cls(active("codeBlock"))}
              title="Code block"
              onClick={() => ed().chain().focus().toggleCodeBlock().run()}
              innerHTML={SquareCode}
            />
            <button
              class="sticky-tool"
              title="Insert table"
              onClick={() =>
                ed().chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
              }
              innerHTML={TableIcon}
            />
          </div>
        )}
      </Show>
      <div ref={host} class="sticky-markdown-edit" />
    </div>
  );
};
