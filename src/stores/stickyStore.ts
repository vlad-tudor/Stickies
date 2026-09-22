// Facade over the board store — the one import site for board state.
//
// The layers underneath (each reads in one sitting):
//   ~/domain/board              pure model: types + stateless rules
//   ./board/boardDocs           Yjs side: doc schema, typed access, doc registry
//   ./board/boardProjection     solid side: reactive projection + doc→store binding
//   ./board/boardActions        board-level ops: load/lifecycle + registry CRUD
//   ./board/stickyActions       content ops: sticky + thread mutations
// Consumers import from here; the internals (store/setStore, doc access,
// dirty-geometry plumbing) stay inside the board/ modules.

export { MIN_STICKY_WIDTH, MIN_STICKY_HEIGHT, stickyCenter, threadAnchor } from "~/domain/board";
export type { ImageRef, StickyNote, Thread, Board } from "~/domain/board";

export {
  boards,
  activeBoardId,
  activeBoard,
  stickies,
  threads,
  activeBgColor,
} from "./board/boardProjection";

export {
  loadBoards,
  createBoard,
  duplicateBoard,
  deleteBoard,
  renameBoard,
  switchBoard,
  reorderBoards,
  reorderBoardTo,
  updateBoardBgColor,
} from "./board/boardActions";

export {
  sessionFor,
  startSession,
  endSession,
  joinSessionFromHash,
  resumeSessions,
  SessionStatus,
  type Session,
} from "./board/collabSession";

export {
  remoteHoldOn,
  holdSticky,
  releaseHold,
  presenceClientId,
  yieldsEditorToPeer,
  publishCursor,
  clearCursor,
  remoteCursorsOn,
  awarenessFor,
  HoldKind,
  type RemoteHold,
  type RemoteCursor,
} from "./board/presence";

export {
  ensureNoteBody,
  noteHasBodyFragment,
  noteBodyFragment,
  observeNoteBody,
} from "./board/boardDocs";

export {
  addThread,
  deleteThread,
  updateStickyNote,
  moveStickyNote,
  resizeStickyNote,
  commitStickies,
  raiseSticky,
  deleteStickyNote,
  moveStickyToBoard,
  clearAllStickies,
  createStickyNote,
  duplicateStickyNote,
} from "./board/stickyActions";
