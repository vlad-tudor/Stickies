// Behavioral contract of the board store — the semantics the Yjs/CRDT rewrite
// (Phase 7) must preserve. Tests go through the exported store fns only (the
// same funnel the rewrite swaps out) and assert observable state, not
// implementation. Where a representation is known to change (z-order = array
// order today), the test is named for the BEHAVIOR.
import { test, expect, describe } from "bun:test";
import {
  loadBoards,
  boards,
  activeBoardId,
  activeBoard,
  stickies,
  threads,
  activeBgColor,
  createBoard,
  duplicateBoard,
  deleteBoard,
  renameBoard,
  switchBoard,
  reorderBoards,
  reorderBoardTo,
  updateBoardBgColor,
  addThread,
  deleteThread,
  createStickyNote,
  updateStickyNote,
  moveStickyNote,
  resizeStickyNote,
  deleteStickyNote,
  duplicateStickyNote,
  raiseSticky,
  moveStickyToBoard,
  clearAllStickies,
  stickyCenter,
  threadAnchor,
  type StickyNote,
  type Board,
} from "./stickyStore";
import { serializeBoardToHash } from "~/utils/urlState";

const STORAGE_KEY = "stickies-boards";

const note = (id: string, over: Partial<StickyNote> = {}): StickyNote => ({
  id,
  position: [0, 0],
  dimensions: [300, 320],
  content: "",
  color: "cream",
  z: 0,
  ...over,
});

// topmost note of the current board (stacking = max z)
const topNote = (): StickyNote =>
  stickies().reduce((top, s) => (s.z > top.z ? s : top));

const board = (id: string, name: string, over: Partial<Board> = {}): Board => ({
  id,
  name,
  stickies: [],
  threads: [],
  bgColor: "cream",
  ...over,
});

// Reset to a clean bootstrap state (one fresh "Board 1").
const fresh = () => {
  localStorage.clear();
  window.location.hash = "";
  loadBoards();
};

// Reset to a specific persisted state (exercises the load/normalize path).
const seed = (bs: Board[], active = bs[0]?.id ?? "") => {
  localStorage.clear();
  window.location.hash = "";
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ boards: bs, activeBoardId: active }));
  loadBoards();
};

describe("load & normalization", () => {
  test("empty storage bootstraps one Board 1", () => {
    fresh();
    expect(boards().length).toBe(1);
    expect(boards()[0].name).toBe("Board 1");
    expect(activeBoardId()).toBe(boards()[0].id);
  });

  test("persisted boards load as saved", () => {
    seed([board("a", "Alpha", { stickies: [note("s1", { content: "<p>hi</p>" })] })], "a");
    expect(boards().length).toBe(1);
    expect(activeBoard()?.name).toBe("Alpha");
    expect(stickies()[0].content).toBe("<p>hi</p>");
  });

  test("legacy markdown content converts to HTML on load", () => {
    seed([board("a", "A", { stickies: [note("s1", { content: "# Title" })] })]);
    expect(stickies()[0].content).toContain("<h1>");
    expect(stickies()[0].content).toContain("Title");
  });

  test("HTML content is left untouched on load", () => {
    seed([board("a", "A", { stickies: [note("s1", { content: "<p><strong>b</strong></p>" })] })]);
    expect(stickies()[0].content).toBe("<p><strong>b</strong></p>");
  });

  test("legacy hex colors normalize to the nearest tone", () => {
    seed([
      board("a", "A", {
        // exact light-mode reference hexes for butter / rose
        stickies: [
          note("s1", { color: "#f0d98a" as StickyNote["color"] }),
          note("s2", { color: "#ecc9bf" as StickyNote["color"] }),
        ],
        bgColor: "#c5d2d8" as Board["bgColor"],
      }),
    ]);
    expect(stickies()[0].color).toBe("butter");
    expect(stickies()[1].color).toBe("rose");
    expect(activeBgColor()).toBe("sky");
  });

  test("threads with missing endpoints are pruned on load", () => {
    seed([
      board("a", "A", {
        stickies: [note("s1"), note("s2")],
        threads: [
          { id: "t1", from: "s1", to: "s2" },
          { id: "t2", from: "s1", to: "gone" },
        ],
      }),
    ]);
    expect(threads().map((t) => t.id)).toEqual(["t1"]);
  });

  test("legacy single-board storage migrates to My Board", () => {
    localStorage.clear();
    window.location.hash = "";
    localStorage.setItem("stickies-storage", JSON.stringify([note("s1", { content: "hello" })]));
    localStorage.setItem("whiteboard-bg", "#cfd6b8");
    loadBoards();
    expect(boards().length).toBe(1);
    expect(boards()[0].name).toBe("My Board");
    expect(activeBgColor()).toBe("sage");
    expect(localStorage.getItem("stickies-storage")).toBeNull();
    expect(localStorage.getItem("whiteboard-bg")).toBeNull();
  });

  test("a shared board in the URL hash imports as a new active tab", () => {
    fresh();
    const shared = board("x", "Shared", {
      stickies: [note("s1", { content: "<p>hi</p>" })],
      bgColor: "sage",
    });
    window.location.hash = serializeBoardToHash(shared);
    loadBoards();
    expect(boards().length).toBe(2);
    const imported = boards()[1];
    expect(imported.name.startsWith("Shared (imported ")).toBe(true);
    expect(activeBoardId()).toBe(imported.id);
    expect(imported.stickies[0].content).toBe("<p>hi</p>");
    expect(imported.bgColor).toBe("sage");
    expect(window.location.hash).toBe("");
  });

  test("mutations persist to localStorage (debounced)", async () => {
    fresh();
    createBoard("Persisted");
    await new Promise((r) => setTimeout(r, 320));
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as {
      boards: Board[];
      activeBoardId: string;
    };
    expect(data.boards.some((b) => b.name === "Persisted")).toBe(true);
    expect(data.activeBoardId).toBe(activeBoardId());
  });
});

describe("board CRUD", () => {
  // NOTE: board/thread ids are Date.now() strings today — two creates in the
  // same millisecond collide. Tests seed explicit ids to sidestep it; the id
  // scheme must change for collab anyway (multiple clients minting ids).
  test("createBoard auto-names and activates", () => {
    seed([board("a", "Board 1")], "a");
    const id = createBoard();
    expect(boards().length).toBe(2);
    expect(boards()[1].name).toBe("Board 2");
    expect(activeBoardId()).toBe(id);
    expect(id).not.toBe("a");
  });

  test("createBoard deduplicates explicit names", () => {
    seed([board("a", "Board 1"), board("b", "Notes")], "a");
    createBoard("Notes");
    const names = boards().map((b) => b.name);
    expect(names).toContain("Notes");
    expect(names).toContain("Notes (1)");
    expect(new Set(names).size).toBe(names.length);
  });

  test("renameBoard deduplicates against other boards", () => {
    seed([board("a", "A"), board("b", "Target")], "a");
    renameBoard("a", "Target");
    expect(boards().find((b) => b.id === "a")?.name).toBe("Target (1)");
  });

  test("renameBoard to its own name keeps it", () => {
    seed([board("a", "Keep"), board("b", "B")], "a");
    renameBoard("a", "Keep");
    expect(boards().find((b) => b.id === "a")?.name).toBe("Keep");
  });

  test("deleteBoard switches active to a neighbour", () => {
    seed([board("a", "A"), board("b", "B"), board("c", "C")], "b");
    deleteBoard("b");
    expect(boards().map((b) => b.id)).toEqual(["a", "c"]);
    expect(activeBoardId()).toBe("c");
  });

  test("deleting a non-active board keeps the active one", () => {
    seed([board("a", "A"), board("b", "B")], "a");
    deleteBoard("b");
    expect(activeBoardId()).toBe("a");
  });

  test("deleting the last board leaves no active board", () => {
    seed([board("a", "A")], "a");
    deleteBoard("a");
    expect(boards().length).toBe(0);
    expect(activeBoardId()).toBe("");
  });

  test("duplicateBoard clones notes with fresh ids and remaps threads", () => {
    seed(
      [
        board("a", "A", {
          stickies: [
            note("s1", { content: "<p>one</p>", position: [5, 6] }),
            note("s2", { content: "<p>two</p>" }),
          ],
          threads: [{ id: "t1", from: "s1", to: "s2" }],
        }),
      ],
      "a"
    );
    const copyId = duplicateBoard("a");
    expect(copyId).not.toBeNull();
    const copy = boards().find((b) => b.id === copyId)!;
    expect(copy.name).toBe("A (copy)");
    expect(activeBoardId()).toBe(copyId!);
    expect(copy.stickies.length).toBe(2);
    // fresh ids, same content/geometry
    expect(copy.stickies[0].id).not.toBe("s1");
    expect(copy.stickies[1].id).not.toBe("s2");
    expect(copy.stickies[0].content).toBe("<p>one</p>");
    expect(copy.stickies[0].position).toEqual([5, 6]);
    // thread endpoints remapped onto the clones
    expect(copy.threads.length).toBe(1);
    expect(copy.threads[0].from).toBe(copy.stickies[0].id);
    expect(copy.threads[0].to).toBe(copy.stickies[1].id);
    // source untouched
    const src = boards().find((b) => b.id === "a")!;
    expect(src.stickies.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  test("switchBoard ignores unknown ids", () => {
    seed([board("a", "A"), board("b", "B")], "a");
    switchBoard("nope");
    expect(activeBoardId()).toBe("a");
    switchBoard("b");
    expect(activeBoardId()).toBe("b");
  });

  test("reorderBoards moves a board to another's slot", () => {
    seed([board("a", "A"), board("b", "B"), board("c", "C")]);
    reorderBoards("a", "c");
    expect(boards().map((b) => b.id)).toEqual(["b", "c", "a"]);
  });

  test("reorderBoardTo commits a final index", () => {
    seed([board("a", "A"), board("b", "B"), board("c", "C")]);
    reorderBoardTo("c", 0);
    expect(boards().map((b) => b.id)).toEqual(["c", "a", "b"]);
  });

  test("updateBoardBgColor sets the board's tone", () => {
    fresh();
    updateBoardBgColor(activeBoardId(), "rose");
    expect(activeBgColor()).toBe("rose");
  });
});

describe("threads", () => {
  // fresh board with notes "a" and "b"; returns its board id
  const twoNotes = (): string => {
    fresh();
    const bid = activeBoardId();
    createStickyNote(bid, note("a"));
    createStickyNote(bid, note("b"));
    return bid;
  };

  test("addThread links two notes", () => {
    const bid = twoNotes();
    addThread(bid, "a", "b");
    expect(threads().length).toBe(1);
    expect(threads()[0].from).toBe("a");
    expect(threads()[0].to).toBe("b");
  });

  test("addThread rejects self-links", () => {
    const bid = twoNotes();
    addThread(bid, "a", "a");
    expect(threads().length).toBe(0);
  });

  test("addThread rejects endpoints that aren't on the board", () => {
    const bid = twoNotes();
    addThread(bid, "a", "elsewhere"); // e.g. a connect drop onto another pane's note
    expect(threads().length).toBe(0);
  });

  test("addThread rejects duplicates in either direction", () => {
    const bid = twoNotes();
    addThread(bid, "a", "b");
    addThread(bid, "a", "b");
    addThread(bid, "b", "a");
    expect(threads().length).toBe(1);
  });

  test("deleteThread removes by id", () => {
    const bid = twoNotes();
    addThread(bid, "a", "b");
    deleteThread(bid, threads()[0].id);
    expect(threads().length).toBe(0);
  });
});

describe("sticky CRUD", () => {
  test("createStickyNote appends to the addressed board", () => {
    fresh();
    createStickyNote(activeBoardId(), note("s1", { content: "<p>x</p>" }));
    expect(stickies().length).toBe(1);
    expect(stickies()[0].id).toBe("s1");
  });

  test("mutations against an unknown board are no-ops", () => {
    fresh();
    createStickyNote("no-such-board", note("s1"));
    expect(stickies().length).toBe(0);
  });

  test("updateStickyNote merges a partial update", () => {
    fresh();
    const bid = activeBoardId();
    createStickyNote(bid, note("s1"));
    updateStickyNote(bid, "s1", { content: "<p>edited</p>", color: "sky" });
    expect(stickies()[0].content).toBe("<p>edited</p>");
    expect(stickies()[0].color).toBe("sky");
    expect(stickies()[0].dimensions).toEqual([300, 320]); // untouched fields survive
  });

  test("moveStickyNote and resizeStickyNote update geometry", () => {
    fresh();
    const bid = activeBoardId();
    createStickyNote(bid, note("s1"));
    moveStickyNote(bid, "s1", [40, 50]);
    resizeStickyNote(bid, "s1", [400, 360]);
    expect(stickies()[0].position).toEqual([40, 50]);
    expect(stickies()[0].dimensions).toEqual([400, 360]);
  });

  test("deleteStickyNote removes the note and its threads", () => {
    fresh();
    const bid = activeBoardId();
    createStickyNote(bid, note("a"));
    createStickyNote(bid, note("b"));
    createStickyNote(bid, note("c"));
    addThread(bid, "a", "b");
    addThread(bid, "b", "c");
    deleteStickyNote(bid, "b");
    expect(stickies().map((s) => s.id)).toEqual(["a", "c"]);
    expect(threads().length).toBe(0);
  });

  test("duplicateStickyNote clones beside with a fresh id and no threads", () => {
    fresh();
    const bid = activeBoardId();
    createStickyNote(bid, note("a", { position: [10, 20], content: "<p>x</p>" }));
    createStickyNote(bid, note("b"));
    addThread(bid, "a", "b");
    duplicateStickyNote(bid, "a");
    expect(stickies().length).toBe(3);
    const clone = stickies()[2]; // appended on top
    expect(clone.id).not.toBe("a");
    expect(clone.content).toBe("<p>x</p>");
    expect(clone.position).toEqual([34, 44]); // +24, +24
    expect(threads().length).toBe(1); // the clone has no connections
  });

  test("new notes stack on top of existing ones", () => {
    fresh();
    const bid = activeBoardId();
    createStickyNote(bid, note("a"));
    createStickyNote(bid, note("b"));
    expect(topNote().id).toBe("b");
  });

  test("raiseSticky puts the note on top of the z-order", () => {
    fresh();
    const bid = activeBoardId();
    createStickyNote(bid, note("a"));
    createStickyNote(bid, note("b"));
    createStickyNote(bid, note("c"));
    raiseSticky(bid, "a");
    expect(topNote().id).toBe("a");
    expect(stickies().map((s) => s.id).sort()).toEqual(["a", "b", "c"]);
  });

  test("z-order survives a persistence round-trip (compacted)", () => {
    // legacy notes without z: array order was the stacking order
    seed([
      board("a", "A", {
        stickies: [
          { ...note("bottom"), z: undefined as unknown as number },
          { ...note("top"), z: undefined as unknown as number },
        ],
      }),
    ]);
    expect(stickies().find((s) => s.id === "bottom")?.z).toBe(0);
    expect(stickies().find((s) => s.id === "top")?.z).toBe(1);

    // sparse z from repeated raises compacts to 0..n-1, order preserved
    seed([
      board("b", "B", {
        stickies: [note("low", { z: 2 }), note("high", { z: 17 })],
      }),
    ]);
    expect(stickies().find((s) => s.id === "low")?.z).toBe(0);
    expect(stickies().find((s) => s.id === "high")?.z).toBe(1);
  });

  test("clearAllStickies empties notes and threads", () => {
    fresh();
    const bid = activeBoardId();
    createStickyNote(bid, note("a"));
    createStickyNote(bid, note("b"));
    addThread(bid, "a", "b");
    clearAllStickies(bid);
    expect(stickies().length).toBe(0);
    expect(threads().length).toBe(0);
  });

  test("moveStickyToBoard transfers the note and severs its threads", () => {
    seed(
      [
        board("src", "Src", {
          stickies: [note("s1", { content: "<p>moved</p>" }), note("s2")],
          threads: [{ id: "t1", from: "s1", to: "s2" }],
        }),
        board("dst", "Dst", { stickies: [note("d")] }),
      ],
      "src"
    );
    moveStickyToBoard("s1", "src", "dst", { x: 50, y: 70 });
    const src = boards().find((b) => b.id === "src")!;
    const dst = boards().find((b) => b.id === "dst")!;
    expect(src.stickies.map((s) => s.id)).toEqual(["s2"]);
    expect(src.threads.length).toBe(0);
    expect(dst.stickies.length).toBe(2);
    const moved = dst.stickies.find((s) => s.id === "s1")!;
    expect(moved.content).toBe("<p>moved</p>");
    expect(moved.position).toEqual([70, 50]); // [top, left] = [y, x]
    // arrives on top of the target board's stack
    expect(moved.z).toBeGreaterThan(dst.stickies.find((s) => s.id === "d")!.z);
  });

  test("moveStickyToBoard is a no-op within the same board", () => {
    seed([board("a", "A", { stickies: [note("s1", { position: [1, 2] })] })], "a");
    moveStickyToBoard("s1", "a", "a", { x: 99, y: 99 });
    expect(stickies()[0].position).toEqual([1, 2]);
  });
});

describe("geometry helpers", () => {
  // position is [top, left]; dimensions [w, h]
  test("stickyCenter", () => {
    expect(stickyCenter({ position: [10, 20], dimensions: [100, 50] })).toEqual({
      x: 70, // left 20 + w/2
      y: 35, // top 10 + h/2
    });
  });

  test("threadAnchor sits at the band middle", () => {
    expect(threadAnchor({ position: [10, 20], dimensions: [100, 50] })).toEqual({
      x: 70,
      y: 26, // top 10 + 16
    });
  });
});
