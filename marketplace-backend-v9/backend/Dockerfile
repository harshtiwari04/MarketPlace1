# syntax=docker/dockerfile:1.7
# Multi-stage: compile TypeScript with dev deps, ship only prod deps + dist.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --legacy-peer-deps

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# curl for the HEALTHCHECK; dumb-init so SIGTERM reaches node and graceful shutdown runs.
RUN apk add --no-cache curl dumb-init
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT:-5000}/health" || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
