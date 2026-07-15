// Guard against reintroducing the awareness field collision that crashed every
// open editor in a live session: y-prosemirror's collaboration-cursor plugin
// OWNS the awareness "cursor" field (editor selections as {anchor,head}) and
// calls createRelativePositionFromJSON on it each transaction. Publishing a
// board pointer {x,y} there makes json.type read `undefined` and takes the
// editor down. Presence must keep its own fields off "cursor".
//
// The crash itself needs a real ProseMirror view (happy-dom builds none), so it
// can't be reproduced here — instead we pin the invariant: presence never
// writes the reserved field.
import { test, expect } from "bun:test";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import {
  attachPresence,
  detachPresence,
  publishCursor,
  holdSticky,
  HoldKind,
} from "~/stores/board/presence";

const RESERVED_FIELD = "cursor"; // y-prosemirror collaboration-cursor's field

test("publishCursor stays off the reserved 'cursor' awareness field", () => {
  const aw = new Awareness(new Y.Doc());
  attachPresence("board-cursor", aw);
  try {
    publishCursor("board-cursor", 12, 34);
    const state = (aw.getLocalState() ?? {}) as Record<string, unknown>;
    expect(state[RESERVED_FIELD]).toBeUndefined();
    expect(state.pointer).toMatchObject({ x: 12, y: 34 });
  } finally {
    detachPresence("board-cursor");
  }
});

test("holdSticky publishes on 'hold', never the reserved 'cursor' field", () => {
  const aw = new Awareness(new Y.Doc());
  attachPresence("board-hold", aw);
  try {
    holdSticky("board-hold", "sticky-1", HoldKind.Editing);
    const state = (aw.getLocalState() ?? {}) as Record<string, unknown>;
    expect(state[RESERVED_FIELD]).toBeUndefined();
    expect(state.hold).toMatchObject({ stickyId: "sticky-1" });
  } finally {
    detachPresence("board-hold");
  }
});
