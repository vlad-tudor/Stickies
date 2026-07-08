import { createStore, produce } from "solid-js/store";
import { WebsocketProvider } from "y-websocket";
import { COLLAB_WS_URL } from "~/config";
import { newId } from "~/utils/id";
import { clearHash, joinUrlFor, readJoinRoomFromHash } from "~/utils/urlState";
import { docOf } from "./boardDocs";
import { boardIndex } from "./boardProjection";
import { switchBoard, registerJoinedBoard } from "./boardActions";

// Live collab sessions — explicit opt-in per board. "Go live" binds a board's
// existing Y.Doc to a fresh relay room; the join URL (#join=<roomId>) is an
// unguessable capability. Joining creates a LOCAL board bound to the same
// room (the doc fills over the wire); ending a session disconnects but every
// participant keeps their copy (docs persist in IndexedDB, so a reconnect
// resumes the same CRDT history and merges instead of colliding).
//
// Sessions survive reloads: boardId->roomId persists and reconnects on load.

export const SessionStatus = {
  Connecting: "connecting",
  Connected: "connected",
  Disconnected: "disconnected",
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export type Session = {
  roomId: string;
  status: SessionStatus;
  peers: number; // awareness states in the room, INCLUDING ourselves
};

const SESSIONS_KEY = "stickies.sessions";

const [sessions, setSessions] = createStore<Record<string, Session>>({});

export const sessionFor = (boardId: string): Session | undefined =>
  sessions[boardId];

const providers = new Map<string, WebsocketProvider>();

const persistSessions = (): void => {
  const roomByBoard: Record<string, string> = {};
  for (const [boardId, session] of Object.entries(sessions)) {
    roomByBoard[boardId] = session.roomId;
  }
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(roomByBoard));
};

const asSessionStatus = (value: string): SessionStatus => {
  const known = Object.values(SessionStatus) as string[];
  return known.includes(value)
    ? (value as SessionStatus)
    : SessionStatus.Connecting;
};

// Bind a board's doc to a relay room. False if the board has no doc.
const connect = (boardId: string, roomId: string): boolean => {
  if (providers.has(boardId)) return true;
  const doc = docOf(boardId);
  if (!doc) return false;

  const provider = new WebsocketProvider(COLLAB_WS_URL, roomId, doc);
  providers.set(boardId, provider);
  setSessions(boardId, { roomId, status: SessionStatus.Connecting, peers: 1 });

  provider.on("status", (event: { status: string }) => {
    if (sessions[boardId]) {
      setSessions(boardId, "status", asSessionStatus(event.status));
    }
  });
  provider.awareness.on("update", () => {
    if (sessions[boardId]) {
      setSessions(boardId, "peers", provider.awareness.getStates().size);
    }
  });

  persistSessions();
  return true;
};

// Start a live session for a board. Returns the join URL (null if the board
// is gone).
export function startSession(boardId: string): string | null {
  const existing = sessions[boardId];
  if (existing) return joinUrlFor(existing.roomId);
  const roomId = newId();
  if (!connect(boardId, roomId)) return null;
  return joinUrlFor(roomId);
}

// Disconnect a board from its room. The local copy stays (doc + IDB log).
export function endSession(boardId: string): void {
  providers.get(boardId)?.destroy();
  providers.delete(boardId);
  setSessions(produce((all) => delete all[boardId]));
  persistSessions();
}

// Handle a #join=<roomId> link: bind a NEW local board to that room (or hop
// to the board already bound to it). Returns the board id to show, or null
// when the hash carries no join link.
export function joinSessionFromHash(): string | null {
  const roomId = readJoinRoomFromHash();
  if (!roomId) return null;
  clearHash();

  const alreadyJoined = Object.entries(sessions).find(
    ([, session]) => session.roomId === roomId,
  );
  if (alreadyJoined) {
    switchBoard(alreadyJoined[0]);
    return alreadyJoined[0];
  }

  const boardId = registerJoinedBoard("Live session");
  connect(boardId, roomId);
  return boardId;
}

// Reconnect persisted sessions after loadBoards() (boards whose doc is gone
// are dropped from the persisted map).
export function resumeSessions(): void {
  const raw = localStorage.getItem(SESSIONS_KEY);
  if (!raw) return;
  try {
    // JSON.parse is untyped; this cast states the persisted session format
    const roomByBoard = JSON.parse(raw) as Record<string, string>;
    for (const [boardId, roomId] of Object.entries(roomByBoard)) {
      if (boardIndex(boardId) !== -1) connect(boardId, roomId);
    }
    persistSessions(); // rewrites without any dropped entries
  } catch {
    localStorage.removeItem(SESSIONS_KEY);
  }
}
