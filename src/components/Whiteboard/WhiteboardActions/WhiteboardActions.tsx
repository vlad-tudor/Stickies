import { clearAllStickies, createStickyNote } from "~/stores/stickyStore";
import "./whiteboard-actions.scss";

export const WhiteboardActions = () => {
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
    </div>
  );
};
