# Collab relay: y-websocket's room server, driven by our own entrypoint
# (server.js) rather than its bundled bin. Contentless — it forwards Yjs updates
# between room members and holds rooms in memory; all merge logic lives in the
# clients. No app code, no persistence.
#
# The custom entrypoint exists because the stock bin leaks rooms: it only frees
# a doc when persistence is configured, which it isn't here, so every room ever
# opened stayed in memory until restart. See server.js.
#
# NB: y-websocket@1.x is the yjs-13-compatible line that ships the server bin.
# v2+ is client-only, and @y/websocket-server is the unreleased yjs-v14 line
# (broken import of @y/y) — do not use either here.
FROM docker.io/library/node:22-alpine

WORKDIR /relay
RUN npm install --no-save --no-audit --no-fund y-websocket@1.5.4 ws@8

ENV HOST=0.0.0.0 \
    PORT=1234

COPY server.js ./

EXPOSE 1234
CMD ["node", "server.js"]
