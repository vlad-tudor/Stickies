#!/usr/bin/env node

// Custom entrypoint, replacing the stock `y-websocket-server` bin.
//
// WHY THIS EXISTS: the stock server never frees a room. Its closeConn only
// deletes a doc from the `docs` map inside `if (doc.conns.size === 0 &&
// persistence !== null)`, and we set no YPERSISTENCE, so the branch never runs.
// Every room ever opened keeps a full Y.Doc in memory until the process
// restarts — growth that has nothing to do with how many people are online, and
// that the Traefik connection caps cannot see or bound.
//
// Evicting an EMPTY room is safe because the relay is a relay, not a store:
// every participant holds the board's own update log in IndexedDB, so a
// reconnect to an evicted room name rebuilds it from the clients' state and
// merges as usual. What must not happen is evicting a room someone is about to
// come back to mid-blip, hence the grace window below.
//
// Everything else is the stock bootstrap, including the plain-HTTP `okay`
// response — the Uptime Kuma monitor matches on that keyword.
const http = require("http");
const WebSocket = require("ws");
// NB: no ".js" — y-websocket's exports map publishes this as "./bin/utils", and
// the extensioned path is NOT exported (the stock bin only gets away with
// require("./utils.js") because a relative path inside the package bypasses
// exports entirely).
const { setupWSConnection, docs } = require("y-websocket/bin/utils");

const host = process.env.HOST || "localhost";
const port = process.env.PORT || 1234;

// How long a room stays resident with nobody in it. Must clear the client's
// reconnect backoff by a wide margin (y-websocket retries with exponential
// backoff capped at maxBackoffTime = 2500ms), so that a network blip resumes
// the same room instead of finding it gone and re-creating it empty.
const EMPTY_ROOM_GRACE_MS = 60_000;
const SWEEP_INTERVAL_MS = 10_000;

// room name -> the timestamp it last became empty. Absent means occupied.
const emptySince = new Map();

const sweepEmptyRooms = (now = Date.now()) => {
  const evicted = [];
  for (const [name, doc] of docs) {
    if (doc.conns.size > 0) {
      emptySince.delete(name);
      continue;
    }
    const since = emptySince.get(name);
    if (since === undefined) {
      emptySince.set(name, now);
      continue;
    }
    if (now - since < EMPTY_ROOM_GRACE_MS) continue;
    doc.awareness.destroy();
    doc.destroy();
    docs.delete(name);
    emptySince.delete(name);
    evicted.push(name);
  }
  if (evicted.length > 0) {
    console.log(`evicted ${evicted.length} empty room(s); ${docs.size} remaining`);
  }
  return evicted;
};

const server = http.createServer((request, response) => {
  response.writeHead(200, { "Content-Type": "text/plain" });
  response.end("okay");
});

const wss = new WebSocket.Server({ noServer: true });
wss.on("connection", setupWSConnection);

server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
});

const sweepTimer = setInterval(() => sweepEmptyRooms(), SWEEP_INTERVAL_MS);
sweepTimer.unref?.();

server.listen(port, host, () => {
  console.log(`relay running at '${host}' on port ${port}`);
  console.log(
    `empty rooms evicted after ${EMPTY_ROOM_GRACE_MS}ms, swept every ${SWEEP_INTERVAL_MS}ms`,
  );
});

module.exports = { sweepEmptyRooms, EMPTY_ROOM_GRACE_MS };
