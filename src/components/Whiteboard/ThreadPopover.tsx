import { Show } from "solid-js";
import { animate } from "animejs";
import { deleteThread } from "~/stores/stickyStore";
import { selectedThread, setSelectedThread } from "~/stores/uiStore";
import { MOTION } from "~/utils/motion";
import { Trash2 } from "lucide-static";

// Fade out every segment of a thread (across panes), then prune it from the store —
// node-stays-mounted exit, same trick as the sticky delete.
const removeThreadAnimated = (id: string): void => {
  setSelectedThread(null);
  const els = document.querySelectorAll(`.thread-seg[data-tid="${id}"]`);
  if (els.length === 0) {
    deleteThread(id);
    return;
  }
  animate(els, {
    opacity: 0,
    duration: MOTION.leave,
    ease: "outQuad",
    onComplete: () => deleteThread(id),
  });
};

// Small menu at the point where a thread was clicked. Chrome (outside the
// transformed viewport) so it stays screen-sized and screen-positioned.
export const ThreadPopover = () => (
  <Show when={selectedThread()}>
    {(t) => (
      <div
        class="thread-popover"
        style={{ left: `${t().x}px`, top: `${t().y}px` }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button onClick={() => removeThreadAnimated(t().id)}>
          <span class="ico" innerHTML={Trash2} />
          Remove
        </button>
      </div>
    )}
  </Show>
);
