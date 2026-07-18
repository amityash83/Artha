# Builds and serves the React frontend as a plain web app (no Electron), for
# the web/Docker deployment path only. The Electron desktop build is untouched
# and does not use this file.
FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.mts index.html ./
COPY src/ src/

# Backend base URL the browser will call; override at build time with
# --build-arg VITE_API_BASE_URL=http://your-host:8000 for non-compose setups.
ARG VITE_API_BASE_URL=http://localhost:8000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npx tsc && npx vite build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
