import { createSignal, For } from "solid-js";
import {
  clearAllStickies,
  createStickyNote,
  exportStickies,
  importStickies,
  stackAllStickies,
  activeBoard,
  stickies,
  MIN_STICKY_WIDTH,
  MIN_STICKY_HEIGHT,
  StickyNote,
} from "~/stores/stickyStore";
import { downloadJson, readJsonFile } from "~/utils/fileIO";
import { copyShareUrl } from "~/utils/urlState";
import { TONES, type Tone } from "~/utils/tones";
import { theme, toggleTheme } from "~/stores/themeStore";
import { editSticky } from "~/stores/uiStore";
import { pan, zoom, screenToWorld } from "~/stores/viewportStore";
import { Download, Upload, Share2, Sun, Moon } from "lucide-static";
import "./whiteboard-actions.scss";

// screen-space anchor for new notes: just under the "+" button
const SPAWN_ANCHOR = { x: 16, y: 96 };

type WhiteboardActionsProps = {
  bgColor: Tone;
  updateBgColor: (color: Tone) => void;
};

export const WhiteboardActions = (props: WhiteboardActionsProps) => {
  let fileInputRef!: HTMLInputElement;
  // remember the last spawn so we only stagger when nothing has changed since
  let lastSpawn: { id: string; pos: [number, number]; px: number; py: number; z: number } | null = null;

  const onClearAllStickies = () => {
    if (confirm("Are you sure you want to clear all stickies?")) {
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
    const z = zoom();
    const p = pan();

    // default: just under the "+" button, converted screen -> world coords
    const aw = screenToWorld({ x: SPAWN_ANCHOR.x, y: SPAWN_ANCHOR.y });
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

  const onExport = () => {
    downloadJson(exportStickies(), "stickies.json");
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

  const onStack = () => {
    stackAllStickies();
    showToast("Stickies stacked");
  };

  const onFileSelected = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const imported = await readJsonFile<StickyNote[]>(file);
    importStickies(imported);
    window.location.reload();
  };

  return (
    <>
    <div class={`share-toast ${toast() ? "visible" : ""}`}>{toast()}</div>
    <div class="whiteboard-actions">
      <button class="create-sticky" title="New sticky" onClick={onStickyCreate}>
        +
      </button>
      <button class="refresh-stickies-positions" title="Stack all stickies" onClick={onStack}>{"🔄"}</button>
      <button class="clear-all-stickies" title="Clear all stickies" onClick={onClearAllStickies}>
        {"🗑️"}
      </button>
      <button class="export-stickies" title="Export stickies" onClick={onExport} innerHTML={Download} />
      <button class="import-stickies" title="Import stickies" onClick={() => fileInputRef.click()} innerHTML={Upload} />
      <button class="share-board" title="Share board" onClick={onShare} innerHTML={Share2} />
      <button
        class="theme-toggle"
        title={theme() === "dark" ? "Light mode" : "Dark mode"}
        onClick={toggleTheme}
        innerHTML={theme() === "dark" ? Sun : Moon}
      />

      <div class="board-hue" title="Board color">
        <For each={TONES}>
          {(tone) => (
            <button
              type="button"
              class={`hue-dot ${props.bgColor === tone ? "is-selected" : ""}`}
              style={{ "--swatch": `var(--s-${tone})` }}
              title={tone}
              onClick={() => props.updateBgColor(tone)}
            />
          )}
        </For>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={onFileSelected}
      />

      <span class="app-version">v{__APP_VERSION__}</span>
    </div>
    </>
  );
};
