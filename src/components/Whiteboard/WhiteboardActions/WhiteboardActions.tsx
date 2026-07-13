import { createSignal, Show } from "solid-js";
import {
  clearAllStickies,
  createStickyNote,
  ensureNoteBody,
  sessionFor,
  startSession,
  endSession,
  MIN_STICKY_WIDTH,
  MIN_STICKY_HEIGHT,
} from "~/stores/stickyStore";
import { copyShareUrl } from "~/utils/urlState";
import { newId } from "~/utils/id";
import { type Tone } from "~/utils/tones";
import { TonePicker } from "~/components/TonePicker/TonePicker";
import { theme, toggleTheme, Theme } from "~/stores/themeStore";
import { editSticky, markStickyFresh } from "~/stores/uiStore";
import { confirmDialog } from "~/stores/dialogStore";
import { useViewport } from "~/stores/workspace/viewportStore";
import { usePane } from "~/stores/workspace/paneContext";
import { Share2, Sun, Moon, SquareSplitHorizontal, SquareSplitVertical, X, Maximize, Trash2, Radio } from "lucide-static";
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
  const pane = usePane();
  // remember the last spawn so we only stagger when nothing has changed since
  let lastSpawn: { id: string; pos: [number, number]; px: number; py: number; z: number } | null = null;

  const onClearAllStickies = async () => {
    if (await confirmDialog("Clear every sticky on this board? This can't be undone.", {
      title: "Clear board",
      confirmText: "Clear all",
      danger: true,
    })) {
      clearAllStickies(pane.boardId());
    }
  };

  const onStickyCreate = () => {
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
      const prev = pane.stickies().find((s) => s.id === lastSpawn!.id);
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

    const id = newId();
    // BEFORE create: the new Sticky's onMount can flush synchronously inside
    // createStickyNote, so the fresh flag must already be set when it runs.
    markStickyFresh(id);
    createStickyNote(pane.boardId(), {
      id,
      position,
      // never narrower than the editor toolbar
      dimensions: mobile ? [MIN_STICKY_WIDTH, MIN_STICKY_HEIGHT] : [300, MIN_STICKY_HEIGHT],
      content: "",
      color: "butter",
    });
    // new notes are fragment-backed from birth (no legacy seeding race later)
    ensureNoteBody(pane.boardId(), id);
    lastSpawn = { id, pos: position, px: p.x, py: p.y, z };
    editSticky(pane.boardId(), id); // select + open the new note straight into the editor
  };

  const [toast, setToast] = createSignal("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const onShare = () => {
    const board = pane.board();
    if (!board) return;
    copyShareUrl(board);
    showToast("Link copied to clipboard");
  };

  const session = () => sessionFor(pane.boardId());

  // Start a live session, or re-copy the join link of the running one
  // (startSession is idempotent — it returns the existing room's URL).
  const onGoLive = async () => {
    const wasLive = !!session();
    const joinUrl = startSession(pane.boardId());
    if (!joinUrl) return;
    await navigator.clipboard.writeText(joinUrl);
    showToast(wasLive ? "Join link copied" : "Live — join link copied");
  };

  const onEndLive = async () => {
    const end = await confirmDialog(
      "End the live session for this board? Everyone keeps their copy.",
      { title: "End live session", confirmText: "End session", danger: true },
    );
    if (end) endSession(pane.boardId());
  };

  return (
    <>
    <div class={`share-toast ${toast() ? "visible" : ""}`}>{toast()}</div>
    <div class="whiteboard-actions">
      <div class="whiteboard-actions-scroll">
        <button class="create-sticky" title="New sticky" onClick={onStickyCreate}>
          +
        </button>
        <button class="clear-all-stickies" title="Clear all stickies" onClick={onClearAllStickies} innerHTML={Trash2} />
        <button class="share-board" title="Share board" onClick={onShare} innerHTML={Share2} />
        <button
          class="go-live"
          classList={{ live: !!session() }}
          title={
            session()
              ? `Live — ${session()!.peers} here (click to copy the join link)`
              : "Start live session"
          }
          onClick={onGoLive}
          innerHTML={Radio}
        />
        <Show when={session()}>
          {(live) => (
            <>
              <span class="live-count">{live().peers}</span>
              <button
                class="end-live"
                title="End live session"
                onClick={onEndLive}
                innerHTML={X}
              />
            </>
          )}
        </Show>

        <div class="board-hue">
          <TonePicker
            value={props.bgColor}
            onChange={props.updateBgColor}
            title="Board color"
            direction="down"
            portal
          />
        </div>
        <button
          class="theme-toggle"
          title={theme() === Theme.Dark ? "Light mode" : "Dark mode"}
          onClick={toggleTheme}
          innerHTML={theme() === Theme.Dark ? Sun : Moon}
        />

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
    </div>
    </>
  );
};
