import { Show } from "solid-js";
import { deleteThread } from "~/stores/stickyStore";
import { selectedThread, setSelectedThread } from "~/stores/uiStore";
import { Trash2 } from "lucide-static";

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
        <button
          onClick={() => {
            deleteThread(t().id);
            setSelectedThread(null);
          }}
        >
          <span class="ico" innerHTML={Trash2} />
          Remove
        </button>
      </div>
    )}
  </Show>
);
