import { createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import { untrack } from "solid-js/web";
import { type EditorHandle, mountEditor, renderMarkdown } from "~/components/Markdown/markdownEditor";

type EditorLifecycleOptions = {
  el: () => HTMLDivElement;
  content: () => string;
  active: () => boolean;
  rawMode: () => boolean;
  initialHtml: string | undefined;
  onChange: (md: string) => void;
};

export function useEditorLifecycle(options: EditorLifecycleOptions): void {
  const [editorMounted, setEditorMounted] = createSignal(false);
  let editorHandle: EditorHandle | undefined;

  onMount(() => {
    const el = options.el();
    if (options.initialHtml) {
      el.innerHTML = options.initialHtml;
    } else {
      renderMarkdown(el, options.content());
    }
  });

  createEffect(() => {
    const isActive = options.active();
    const isRaw = options.rawMode();
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
      const content = untrack(options.content);
      mountEditor(options.el(), content, options.onChange)
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

  createEffect(on(options.rawMode, (isRaw, prevRaw) => {
    if (prevRaw && !isRaw && !options.active()) {
      renderMarkdown(options.el(), options.content());
    }
  }));

  onCleanup(() => { editorHandle?.destroy(); });
}
