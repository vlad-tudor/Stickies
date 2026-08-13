// Direct unit tests for the pure board-domain rules — previously only covered
// indirectly through the store's load path.
import { test, expect, describe } from "bun:test";
import {
  makeBoard,
  normalizeStickies,
  normalizeThreads,
  normalizeBoard,
  deduplicateName,
  nextBoardName,
  type Board,
  type StickyNote,
} from "./board";

const makeNote = (id: string, over: Partial<StickyNote> = {}): StickyNote => ({
  id,
  position: [0, 0],
  dimensions: [300, 320],
  content: "",
  color: "cream",
  z: 0,
  ...over,
});

describe("normalizeStickies", () => {
  test("converts legacy markdown content to HTML, leaves HTML alone", () => {
    const [markdown, html] = normalizeStickies([
      makeNote("a", { content: "# Title" }),
      makeNote("b", { content: "<p>kept</p>" }),
    ]);
    expect(markdown.content).toContain("<h1>");
    expect(html.content).toBe("<p>kept</p>");
  });

  test("maps legacy hex colors to the nearest tone", () => {
    const [note] = normalizeStickies([makeNote("a", { color: "#f0d98a" as StickyNote["color"] })]);
    expect(note.color).toBe("butter");
  });

  test("assigns missing z from array order and compacts sparse z", () => {
    const legacy = normalizeStickies([
      { ...makeNote("bottom"), z: undefined as unknown as number },
      { ...makeNote("top"), z: undefined as unknown as number },
    ]);
    expect(legacy.find((note) => note.id === "bottom")?.z).toBe(0);
    expect(legacy.find((note) => note.id === "top")?.z).toBe(1);

    const compacted = normalizeStickies([makeNote("low", { z: 2 }), makeNote("high", { z: 17 })]);
    expect(compacted.find((note) => note.id === "low")?.z).toBe(0);
    expect(compacted.find((note) => note.id === "high")?.z).toBe(1);
  });
});

describe("normalizeThreads", () => {
  const notes = [makeNote("a"), makeNote("b")];

  test("keeps threads whose endpoints exist, drops the rest", () => {
    const threads = normalizeThreads(
      [
        { id: "t1", from: "a", to: "b" },
        { id: "t2", from: "a", to: "gone" },
      ],
      notes,
    );
    expect(threads.map((thread) => thread.id)).toEqual(["t1"]);
  });

  test("undefined threads normalize to an empty list", () => {
    expect(normalizeThreads(undefined, notes)).toEqual([]);
  });
});

describe("normalizeBoard", () => {
  test("normalizes color, content, and threads together", () => {
    const board: Board = {
      id: "b1",
      name: "B",
      bgColor: "#c5d2d8" as Board["bgColor"],
      stickies: [makeNote("a", { content: "*md*" })],
      threads: [{ id: "t1", from: "a", to: "missing" }],
    };
    const normalized = normalizeBoard(board);
    expect(normalized.bgColor).toBe("sky");
    expect(normalized.stickies[0].content).toContain("<em>");
    expect(normalized.threads).toEqual([]);
  });
});

describe("naming", () => {
  const board = (name: string): Board => ({ ...makeBoard(name), name });

  test("deduplicateName suffixes with the lowest free number", () => {
    const boards = [board("Notes"), board("Notes (1)")];
    expect(deduplicateName("Fresh", boards)).toBe("Fresh");
    expect(deduplicateName("Notes", boards)).toBe("Notes (2)");
  });

  test("nextBoardName picks a free Board N", () => {
    expect(nextBoardName([])).toBe("Board 1");
    expect(nextBoardName([board("Board 1")])).toBe("Board 2");
    // count-based start with the slot taken walks forward
    expect(nextBoardName([board("Board 2")])).toBe("Board 3");
  });
});

describe("makeBoard", () => {
  test("mints unique ids and defaults", () => {
    const first = makeBoard("A");
    const second = makeBoard("B");
    expect(first.id).not.toBe(second.id);
    expect(first.stickies).toEqual([]);
    expect(first.threads).toEqual([]);
    expect(first.bgColor).toBe("cream");
  });
});
