# syntax=docker/dockerfile:1.7

# ───────────── Build stage ─────────────
FROM node:22-alpine AS build
WORKDIR /app

# VITE_MCP_SERVER_URL is baked into the bundle at build time. Override per
# deployment (Coolify lets you pass build args) — defaults to the prod API.
ARG VITE_MCP_SERVER_URL=https://api.kp.darlingdesign.pro
ENV VITE_MCP_SERVER_URL=$VITE_MCP_SERVER_URL

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ───────────── Serve stage ─────────────
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
