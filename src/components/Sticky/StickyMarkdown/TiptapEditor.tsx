import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
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

type TiptapEditorProps = {
  content: string;
  onChange: (html: string) => void;
  onExit: () => void;
};

export const TiptapEditor = (props: TiptapEditorProps) => {
  let host!: HTMLDivElement;
  const [editor, setEditor] = createSignal<Editor>();
  const [tick, setTick] = createSignal(0); // bumped per transaction to refresh toolbar state

  onMount(() => {
    const ed = new Editor({
      element: host,
      extensions: [
        StarterKit,
        Underline,
        Link.configure({ openOnClick: false }),
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
      ],
      content: props.content || "",
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
      onSelectionUpdate: () => setTick((t) => t + 1),
      onTransaction: () => setTick((t) => t + 1),
    });
    ed.commands.focus("end");
    setEditor(ed);
    onCleanup(() => ed.destroy());
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
          <div class="sticky-toolbar" onMouseDown={(e) => e.preventDefault()}>
            <button class={cls(active("bold"))} title="Bold"
              onClick={() => ed().chain().focus().toggleBold().run()} innerHTML={Bold} />
            <button class={cls(active("italic"))} title="Italic"
              onClick={() => ed().chain().focus().toggleItalic().run()} innerHTML={Italic} />
            <button class={cls(active("underline"))} title="Underline"
              onClick={() => ed().chain().focus().toggleUnderline().run()} innerHTML={UnderlineIcon} />
            <button class={cls(active("heading", { level: 1 }))} title="Heading 1"
              onClick={() => ed().chain().focus().toggleHeading({ level: 1 }).run()} innerHTML={Heading1} />
            <button class={cls(active("heading", { level: 2 }))} title="Heading 2"
              onClick={() => ed().chain().focus().toggleHeading({ level: 2 }).run()} innerHTML={Heading2} />
            <button class={cls(active("bulletList"))} title="Bullet list"
              onClick={() => ed().chain().focus().toggleBulletList().run()} innerHTML={List} />
            <button class={cls(active("orderedList"))} title="Numbered list"
              onClick={() => ed().chain().focus().toggleOrderedList().run()} innerHTML={ListOrdered} />
            <button class={cls(active("codeBlock"))} title="Code block"
              onClick={() => ed().chain().focus().toggleCodeBlock().run()} innerHTML={SquareCode} />
            <button class="sticky-tool" title="Insert table"
              onClick={() => ed().chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} innerHTML={TableIcon} />
          </div>
        )}
      </Show>
      <div ref={host} class="sticky-markdown-edit" />
    </div>
  );
};
