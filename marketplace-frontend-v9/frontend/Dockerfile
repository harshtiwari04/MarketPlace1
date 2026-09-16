# syntax=docker/dockerfile:1.7
# Static build served by nginx. Used for the VPS/self-host path; on Render use the static-site
# blueprint in render.yaml instead (no container needed).
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# VITE_* values are baked in at build time — pass them with --build-arg.
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_RAZORPAY_KEY_ID
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_APP_NAME=Marketplace
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null || exit 1
