# Collab relay: the stock y-websocket room server. Contentless — it forwards
# Yjs updates between room members and holds rooms in memory; all merge logic
# lives in the clients. No app code, no persistence.
#
# NB: y-websocket@1.x is the yjs-13-compatible line that ships the server bin.
# v2+ is client-only, and @y/websocket-server is the unreleased yjs-v14 line
# (broken import of @y/y) — do not use either here.
FROM docker.io/library/node:22-alpine

WORKDIR /relay
RUN npm install --no-save --no-audit --no-fund y-websocket@1.5.4 ws@8

ENV HOST=0.0.0.0 \
    PORT=1234

EXPOSE 1234
CMD ["npx", "y-websocket-server"]
