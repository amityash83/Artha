# Builds and serves the React frontend as a plain web app (no Electron), for
# the web/Docker deployment path only. The Electron desktop build is untouched
# and does not use this file.
FROM node:22-slim AS build
WORKDIR /app

# npm workspaces: every workspace's package.json must be present for `npm ci` to
# accept the lockfile, but only the frontend workspace is installed, so the web image
# never downloads Electron or electron-builder.
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY electron/package.json electron/package.json
RUN npm ci --workspace frontend

COPY scripts/load-env.cjs scripts/load-env.cjs
COPY frontend/ frontend/

# Backend base URL the browser will call; override at build time with
# --build-arg VITE_API_BASE_URL=http://your-host:8000 for non-compose setups.
ARG VITE_API_BASE_URL=http://localhost:8000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
# Optional shared-secret auth (see docker-compose.yml's comment) — empty by
# default, baked into the static bundle at build time, must match the
# backend's ARTHA_API_SECRET.
ARG VITE_API_SECRET=""
ENV VITE_API_SECRET=$VITE_API_SECRET
RUN npm run build --workspace frontend

FROM nginx:alpine
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
