import { For } from "solid-js";
import { remoteCursorsOn } from "~/stores/stickyStore";
import { usePane } from "~/stores/workspace/paneContext";
import { useViewport } from "~/stores/workspace/viewportStore";
import { toneVar } from "~/utils/tones";
import "./remote-cursors.scss";

// Live-session peers' pointers, rendered in WORLD space (inside the viewport
// transform, so they pan/zoom with the board) — but counter-scaled so the
// cursor glyph stays a constant screen size, like the peers' real pointers.
export const RemoteCursors = () => {
  const pane = usePane();
  const vp = useViewport();

  return (
    <For each={remoteCursorsOn(pane.boardId())}>
      {(cursor) => (
        <div
          class="remote-cursor"
          style={{
            left: `${cursor.x}px`,
            top: `${cursor.y}px`,
            transform: `scale(${1 / vp.zoom()})`,
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path
              d="M4 2 L20 12 L12 13.5 L8.5 21 Z"
              fill={toneVar(cursor.color)}
              stroke="var(--ink)"
              stroke-width="1.2"
            />
          </svg>
          <span
            class="remote-cursor-name"
            style={{ "background-color": toneVar(cursor.color) }}
          >
            {cursor.name}
          </span>
        </div>
      )}
    </For>
  );
};
