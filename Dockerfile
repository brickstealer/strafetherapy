# ------------------------------------------------------------------------------
# Build Stage
# ------------------------------------------------------------------------------
FROM node:22-alpine AS builder

# Enable Corepack and prepare PNPM
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Cache dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source code and build production bundle
COPY . .
RUN pnpm run build

# ------------------------------------------------------------------------------
# Production Stage
# ------------------------------------------------------------------------------
FROM nginx:alpine

# Replace default nginx config with optimized one
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
