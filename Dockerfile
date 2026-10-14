# ------------------------------------------------------------------------------
# 1. Build Stage (Client Bundle)
# ------------------------------------------------------------------------------
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# ------------------------------------------------------------------------------
# 2. Production Stage (Unified HTTP Game & WebSocket Server)
# ------------------------------------------------------------------------------
FROM node:22-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Copy built frontend assets and server files
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY src/net ./src/net
COPY src/types.ts ./src/types.ts

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

EXPOSE 8080

CMD ["pnpm", "start"]
