// Share-link codec contract: what a URL produced today must keep decoding to.
import { test, expect } from "bun:test";
import { serializeBoardToHash, readBoardFromHash, clearHash } from "./urlState";
import type { Board } from "~/stores/stickyStore";

const sample: Board = {
  id: "b1",
  name: "Trip plan",
  bgColor: "sage",
  stickies: [
    {
      id: "s1",
      position: [10, 20],
      dimensions: [300, 320],
      content: "<p>pack <strong>tent</strong></p>",
      color: "butter",
    },
    { id: "s2", position: [40, 400], dimensions: [256, 320], content: "", color: "rose" },
  ],
  threads: [{ id: "t1", from: "s1", to: "s2" }],
};

test("serialize -> read round-trips the shared payload", () => {
  window.location.hash = serializeBoardToHash(sample);
  const shared = readBoardFromHash();
  expect(shared).not.toBeNull();
  expect(shared!.name).toBe("Trip plan");
  expect(shared!.bgColor).toBe("sage");
  expect(shared!.stickies).toEqual(sample.stickies);
  expect(shared!.threads).toEqual(sample.threads);
  // board id is deliberately NOT shared (import mints a new board)
  expect("id" in shared!).toBe(false);
});

test("non-board hashes read as null", () => {
  window.location.hash = "";
  expect(readBoardFromHash()).toBeNull();
  window.location.hash = "#something-else";
  expect(readBoardFromHash()).toBeNull();
});

test("corrupt payloads read as null", () => {
  window.location.hash = "#board=!!!not-lz-data!!!";
  expect(readBoardFromHash()).toBeNull();
});

test("clearHash removes the hash", () => {
  window.location.hash = serializeBoardToHash(sample);
  clearHash();
  expect(window.location.hash).toBe("");
});
