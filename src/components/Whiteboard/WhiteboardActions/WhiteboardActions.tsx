import { createSignal } from "solid-js";
import {
  clearAllStickies,
  createStickyNote,
  exportStickies,
  importStickies,
  StickyNote,
} from "~/stores/stickyStore";
import { downloadJson, readJsonFile } from "~/utils/fileIO";
import { Download, Upload } from "lucide-static";
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
    createStickyNote({
      id: Date.now().toString(),
      position: [50, 50],
      dimensions: [300, 300],
      content: "",
      color: "#e3d46f",
    });
  };

  const onExport = () => {
    downloadJson(exportStickies(), "stickies.json");
  };

  const onFileSelected = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const imported = await readJsonFile<StickyNote[]>(file);
    importStickies(imported);
    window.location.reload();
  };

  return (
    <div class={`whiteboard-actions ${open() ? "open" : ""}`}>
      <button class="create-sticky" onClick={onStickyCreate}>
        +
      </button>

      <button class="drawer-toggle" onClick={() => setOpen(!open())}>
        {open() ? "\u2715" : "\u2630"}
      </button>

      <div class="drawer-content">
        <button class="refresh-stickies-positions">{"\uD83D\uDD04"}</button>
        <button class="clear-all-stickies" onClick={onClearAllStickies}>
          {"\uD83D\uDDD1\uFE0F"}
        </button>
        <button class="export-stickies" title="Export stickies" onClick={onExport} innerHTML={Download} />
        <button class="import-stickies" title="Import stickies" onClick={() => fileInputRef.click()} innerHTML={Upload} />
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
  );
};
