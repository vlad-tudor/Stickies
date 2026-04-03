FROM docker.io/oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM docker.io/oven/bun:1-slim AS runtime
WORKDIR /app
COPY --from=builder /app/.output ./.output
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
