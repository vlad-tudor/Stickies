// Guards against the awareness field collisions with the editor's
// collaboration-cursor, which OWNS two fields on the same awareness channel:
//
// - "cursor": editor selections as {anchor,head}. The plugin calls
//   createRelativePositionFromJSON on it each transaction, so a board pointer
//   {x,y} there makes json.type read `undefined` and takes the editor down.
//   The crash needs a real ProseMirror view (happy-dom builds none), so we pin
//   the invariant instead: presence never writes it.
// - "user": caret name + colour. Tiptap and y-prosemirror both hardcode it, and
//   Tiptap writes the colour as a CSS var string, not a Tone. When the app kept
//   its identity there too, a peer's first editor open overwrote it and every
//   hold/pointer colour for that peer broke for the rest of the session.
import { test, expect } from "bun:test";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import {
  attachPresence,
  detachPresence,
  publishCursor,
  holdSticky,
  remoteHoldOn,
  HoldKind,
} from "~/stores/board/presence";
import { localIdentity } from "~/utils/identity";
import { toneVar } from "~/utils/tones";
import {
  freshLiveBoard,
  releaseLiveBoards,
  spawnPresencePeer,
  deliverPresence,
} from "~/test/liveBoard";

const RESERVED_CURSOR_FIELD = "cursor";
const RESERVED_USER_FIELD = "user";

test("publishCursor stays off the reserved 'cursor' awareness field", () => {
  const aw = new Awareness(new Y.Doc());
  attachPresence("board-cursor", aw);
  try {
    publishCursor("board-cursor", 12, 34);
    const state = (aw.getLocalState() ?? {}) as Record<string, unknown>;
    expect(state[RESERVED_CURSOR_FIELD]).toBeUndefined();
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
    expect(state[RESERVED_CURSOR_FIELD]).toBeUndefined();
    expect(state.hold).toMatchObject({ stickyId: "sticky-1" });
  } finally {
    detachPresence("board-hold");
  }
});

test("attachPresence announces identity on its own field, never the editor's 'user'", () => {
  const aw = new Awareness(new Y.Doc());
  attachPresence("board-identity", aw);
  try {
    const state = (aw.getLocalState() ?? {}) as Record<string, unknown>;
    expect(state[RESERVED_USER_FIELD]).toBeUndefined();
    expect(state.identity).toEqual(localIdentity());
  } finally {
    detachPresence("board-identity");
  }
});

test("a peer's editor 'user' field doesn't bleed into presence colours", () => {
  const { boardId, awareness } = freshLiveBoard();
  try {
    const peer = spawnPresencePeer("Peer", "sky");
    // what collaboration-cursor publishes once the peer opens an editor
    peer.setLocalStateField(RESERVED_USER_FIELD, { name: "Peer", color: toneVar("sky") });
    peer.setLocalStateField("hold", {
      stickyId: "sticky-1",
      kind: HoldKind.Editing,
      at: Date.now(),
    });
    deliverPresence(peer, awareness);
    expect(remoteHoldOn(boardId, "sticky-1")?.color).toBe("sky");
  } finally {
    releaseLiveBoards();
  }
});
