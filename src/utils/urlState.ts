import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";
import type { Board } from "~/stores/stickyStore";

const HASH_PREFIX = "board=";

type SharedBoard = Pick<Board, "name" | "stickies" | "bgColor">;

export function serializeBoardToHash(board: Board): string {
  const payload: SharedBoard = {
    name: board.name,
    stickies: board.stickies,
    bgColor: board.bgColor,
  };
  const compressed = compressToEncodedURIComponent(JSON.stringify(payload));
  return `#${HASH_PREFIX}${compressed}`;
}

export function readBoardFromHash(): SharedBoard | null {
  const hash = window.location.hash.slice(1);
  if (!hash.startsWith(HASH_PREFIX)) return null;

  const compressed = hash.slice(HASH_PREFIX.length);
  const json = decompressFromEncodedURIComponent(compressed);
  if (!json) return null;

  try {
    return JSON.parse(json) as SharedBoard;
  } catch {
    return null;
  }
}

export function clearHash(): void {
  history.replaceState(null, "", window.location.pathname);
}

export function copyShareUrl(board: Board): void {
  const hash = serializeBoardToHash(board);
  const url = `${window.location.origin}${window.location.pathname}${hash}`;
  navigator.clipboard.writeText(url);
}
