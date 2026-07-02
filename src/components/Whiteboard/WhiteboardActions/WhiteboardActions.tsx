import { createSignal, Show } from "solid-js";
import {
  clearAllStickies,
  createStickyNote,
  activeBoard,
  stickies,
  MIN_STICKY_WIDTH,
  MIN_STICKY_HEIGHT,
} from "~/stores/stickyStore";
import { copyShareUrl } from "~/utils/urlState";
import { type Tone } from "~/utils/tones";
import { TonePicker } from "~/components/TonePicker/TonePicker";
import { theme, toggleTheme } from "~/stores/themeStore";
import { editSticky, markStickyFresh } from "~/stores/uiStore";
import { confirmDialog } from "~/stores/dialogStore";
import { useViewport } from "~/stores/viewportStore";
import { Share2, Sun, Moon, SquareSplitHorizontal, SquareSplitVertical, X, Maximize } from "lucide-static";
import "./whiteboard-actions.scss";

// screen-space anchor for new notes: just under the "+" button
const SPAWN_ANCHOR = { x: 16, y: 96 };

type WhiteboardActionsProps = {
  bgColor: Tone;
  updateBgColor: (color: Tone) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onFit: () => void;
  onSplit: () => void;
  onSplitDown: () => void;
  onClose: () => void;
  closable: boolean;
};

export const WhiteboardActions = (props: WhiteboardActionsProps) => {
  const vp = useViewport();
  // remember the last spawn so we only stagger when nothing has changed since
  let lastSpawn: { id: string; pos: [number, number]; px: number; py: number; z: number } | null = null;

  const onClearAllStickies = async () => {
    if (await confirmDialog("Clear every sticky on this board? This can't be undone.", {
      title: "Clear board",
      confirmText: "Clear all",
      danger: true,
    })) {
      clearAllStickies();
    }
  };

  const onStickyCreate = () => {
    /**
     * @todo move sticky creation to the store.
     * @note @bug some weird lag when creating multiple stickies quickly.
     *  -- could be related ot the async "milkdown" editor creation/deletion.
     *  -- extra largeness accompanied by errors in the console.
     */
    const mobile = window.innerWidth < 480;
    const z = vp.zoom();
    const p = vp.pan();

    // default: just under the "+" button, converted screen -> world coords
    const aw = vp.screenToWorld({ x: SPAWN_ANCHOR.x, y: SPAWN_ANCHOR.y });
    let position: [number, number] = [aw.y, aw.x]; // [top, left]

    // Stagger from the previous spawn ONLY if nothing has changed since: the
    // previous note still exists, hasn't been moved, and the view hasn't
    // panned/zoomed. Otherwise drop the new note fresh under the "+".
    if (lastSpawn) {
      const prev = stickies().find((s) => s.id === lastSpawn!.id);
      const unmoved =
        prev &&
        prev.position[0] === lastSpawn.pos[0] &&
        prev.position[1] === lastSpawn.pos[1];
      const viewSame = p.x === lastSpawn.px && p.y === lastSpawn.py && z === lastSpawn.z;
      if (unmoved && viewSame) {
        const step = 30 / z; // ~30 screen px down-right
        position = [lastSpawn.pos[0] + step, lastSpawn.pos[1] + step];
      }
    }

    const id = Date.now().toString();
    // BEFORE create: the new Sticky's onMount can flush synchronously inside
    // createStickyNote, so the fresh flag must already be set when it runs.
    markStickyFresh(id);
    createStickyNote({
      id,
      position,
      // never narrower than the editor toolbar
      dimensions: mobile ? [MIN_STICKY_WIDTH, MIN_STICKY_HEIGHT] : [300, MIN_STICKY_HEIGHT],
      content: "",
      color: "butter",
    });
    lastSpawn = { id, pos: position, px: p.x, py: p.y, z };
    editSticky(id); // select + open the new note straight into the editor
  };

  const [toast, setToast] = createSignal("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const onShare = () => {
    const board = activeBoard();
    if (!board) return;
    copyShareUrl(board);
    showToast("Link copied to clipboard");
  };

  return (
    <>
    <div class={`share-toast ${toast() ? "visible" : ""}`}>{toast()}</div>
    <div class="whiteboard-actions">
      <div class="whiteboard-actions-scroll">
        <button class="create-sticky" title="New sticky" onClick={onStickyCreate}>
          +
        </button>
        <button class="clear-all-stickies" title="Clear all stickies" onClick={onClearAllStickies}>
          {"🗑️"}
        </button>
        <button class="share-board" title="Share board" onClick={onShare} innerHTML={Share2} />
        <button
          class="theme-toggle"
          title={theme() === "dark" ? "Light mode" : "Dark mode"}
          onClick={toggleTheme}
          innerHTML={theme() === "dark" ? Sun : Moon}
        />

        <div class="board-hue">
          <TonePicker
            value={props.bgColor}
            onChange={props.updateBgColor}
            title="Board color"
            direction="down"
            portal
          />
        </div>

        <div class="toolbar-zoom">
          <button class="zoom-fit" title="Fit all notes" onClick={props.onFit} innerHTML={Maximize} />
          <button title="Zoom out" onClick={props.onZoomOut}>−</button>
          <button class="zoom-reset" title="Reset view" onClick={props.onZoomReset}>
            {Math.round(props.zoom * 100)}%
          </button>
          <button title="Zoom in" onClick={props.onZoomIn}>+</button>
        </div>

        <button class="split-pane" title="Split right" onClick={props.onSplit} innerHTML={SquareSplitHorizontal} />
        <button class="split-pane-down" title="Split down" onClick={props.onSplitDown} innerHTML={SquareSplitVertical} />
        <Show when={props.closable}>
          <button class="close-pane" title="Close pane" onClick={props.onClose} innerHTML={X} />
        </Show>
      </div>

      <span class="app-version">v{__APP_VERSION__}</span>
    </div>
    </>
  );
};
