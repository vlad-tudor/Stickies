import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import { noteBodyFragment, observeNoteBody } from "~/stores/stickyStore";
import { sanitizeHtml } from "~/utils/sanitizeHtml";
import { fragmentToHtml } from "./editorExtensions";

// Peer keystrokes arrive per character; one serialize per beat is plenty for a
// read-only view.
const RENDER_THROTTLE_MS = 120;

// Rendered-view HTML derived live from the note's body fragment — the converged
// co-editing source — so the non-editing view never waits on the remote
// editor's `content` mirror writes. undefined while the note is legacy (no
// fragment yet) or its fragment is still empty (seed pending): callers fall
// back to the mirror. `enabled` gates the watcher off while our own editor is
// mounted (it already shows the fragment; recomputing per keystroke is waste).
export const useNoteBodyHtml = (
  boardId: Accessor<string>,
  stickyId: Accessor<string>,
  enabled: Accessor<boolean>,
): Accessor<string | undefined> => {
  const [html, setHtml] = createSignal<string | undefined>(undefined);

  createEffect(() => {
    if (!enabled()) return;
    const board = boardId();
    const id = stickyId();

    const compute = (): void => {
      const fragment = noteBodyFragment(board, id);
      setHtml(fragment && fragment.length > 0 ? sanitizeHtml(fragmentToHtml(fragment)) : undefined);
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleCompute = (): void => {
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        compute();
      }, RENDER_THROTTLE_MS);
    };

    const unobserve = observeNoteBody(board, id, scheduleCompute);
    compute();
    onCleanup(() => {
      clearTimeout(timer);
      unobserve();
    });
  });

  return html;
};
