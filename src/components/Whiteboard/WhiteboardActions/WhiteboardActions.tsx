import { createSignal, For } from "solid-js";
import {
  clearAllStickies,
  createStickyNote,
  exportStickies,
  importStickies,
  stackAllStickies,
  activeBoard,
  stickies,
  StickyNote,
} from "~/stores/stickyStore";
import { downloadJson, readJsonFile } from "~/utils/fileIO";
import { copyShareUrl } from "~/utils/urlState";
import { TONES, type Tone } from "~/utils/tones";
import { theme, toggleTheme } from "~/stores/themeStore";
import { editSticky } from "~/stores/uiStore";
import { Download, Upload, Share2, Sun, Moon } from "lucide-static";
import "./whiteboard-actions.scss";

type WhiteboardActionsProps = {
  bgColor: Tone;
  updateBgColor: (color: Tone) => void;
};

export const WhiteboardActions = (props: WhiteboardActionsProps) => {
  let fileInputRef!: HTMLInputElement;

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
    // Cascade the spawn down-right while that exact spot is occupied — so
    // pressing "+" repeatedly without moving the new note stacks them in a
    // staggered pile instead of exactly overlapping.
    const STEP = 30;
    const taken = new Set(stickies().map((s) => `${s.position[0]},${s.position[1]}`));
    let position: [number, number] = [100, 20];
    while (taken.has(`${position[0]},${position[1]}`)) {
      position = [position[0] + STEP, position[1] + STEP];
    }
    const id = Date.now().toString();
    createStickyNote({
      id,
      position,
      dimensions: mobile ? [200, 200] : [300, 300],
      content: "",
      color: "butter",
    });
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
