// The one id mint. Every board/sticky/thread/image id comes from here — ids are
// permanent keys (they'll become CRDT map keys in collab, where multiple clients
// mint concurrently), so they must be collision-free. The previous Date.now()
// scheme collided for same-millisecond creates.
export const newId = (): string => crypto.randomUUID();
