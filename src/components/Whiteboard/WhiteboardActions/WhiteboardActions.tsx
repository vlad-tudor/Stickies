import {
  clearAllStickies,
  createStickyNote,
  exportStickies,
  importStickies,
  StickyNote,
} from "~/stores/stickyStore";
import "./whiteboard-actions.scss";

export const WhiteboardActions = () => {
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
    createStickyNote({
      id: Date.now().toString(),
      position: [50, 50],
      dimensions: [300, 300],
      content: "",
      color: "#e3d46f",
    });
  };

  const onExport = () => {
    const json = exportStickies();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stickies.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFileSelected = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const imported = JSON.parse(reader.result as string) as StickyNote[];
      importStickies(imported);
      window.location.reload();
    };
    reader.readAsText(file);
  };

  return (
    <div class="whiteboard-actions">
      <button class="create-sticky" onClick={onStickyCreate}>
        +
      </button>

      {/* will cleverly position all the sticky elements under each other */}
      <button class="refresh-stickies-positions">🔄</button>
      <button class="clear-all-stickies" onClick={onClearAllStickies}>
        🗑️
      </button>
      <button class="export-stickies" onClick={onExport}>
        Export
      </button>
      <button class="import-stickies" onClick={() => fileInputRef.click()}>
        Import
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={onFileSelected}
      />
    </div>
  );
};
