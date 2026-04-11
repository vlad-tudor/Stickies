import { createSignal } from "solid-js";
import {
  clearAllStickies,
  createStickyNote,
  exportStickies,
  importStickies,
  stackAllStickies,
  activeBoard,
  StickyNote,
} from "~/stores/stickyStore";
import { downloadJson, readJsonFile } from "~/utils/fileIO";
import { copyShareUrl } from "~/utils/urlState";
import { Download, Upload, Share2 } from "lucide-static";
import "./whiteboard-actions.scss";

type WhiteboardActionsProps = {
  bgColor: string;
  updateBgColor: (color: string) => void;
};

export const WhiteboardActions = (props: WhiteboardActionsProps) => {
  let fileInputRef!: HTMLInputElement;
  const [open, setOpen] = createSignal(false);

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
    createStickyNote({
      id: Date.now().toString(),
      position: [100, 20],
      dimensions: mobile ? [200, 200] : [300, 300],
      content: "",
      color: "#e3d46f",
    });
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
    <div class={`whiteboard-actions ${open() ? "open" : ""}`}>
      <button class="create-sticky" onClick={onStickyCreate}>
        +
      </button>

      <button class="drawer-toggle" onClick={() => setOpen(!open())}>
        {open() ? "\u2715" : "\u2630"}
      </button>

      <div class="drawer-content">
        <button class="refresh-stickies-positions" title="Stack all stickies" onClick={onStack}>{"\uD83D\uDD04"}</button>
        <button class="clear-all-stickies" onClick={onClearAllStickies}>
          {"\uD83D\uDDD1\uFE0F"}
        </button>
        <button class="export-stickies" title="Export stickies" onClick={onExport} innerHTML={Download} />
        <button class="import-stickies" title="Import stickies" onClick={() => fileInputRef.click()} innerHTML={Upload} />
        <button class="share-board" title="Share board" onClick={onShare} innerHTML={Share2} />
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={onFileSelected}
        />
        <input
          type="color"
          class="whiteboard-bg-picker"
          value={props.bgColor}
          onInput={(e) => props.updateBgColor(e.currentTarget.value)}
        />
      </div>
    </div>
    </>
  );
};
