# syntax=docker/dockerfile:1.7

# ───────────── Build stage ─────────────
FROM node:22-alpine AS build
WORKDIR /app

# python3 + build tools needed if better-sqlite3 has to compile from source.
# Most of the time prebuilt binaries cover linux-x64-musl, but keep the
# fallback so the build never fails on a missing prebuild.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ───────────── Runtime stage ─────────────
FROM node:22-alpine
WORKDIR /app

# Install production deps only. better-sqlite3 will pick up its prebuilt
# binary or fall back to compiling against the build-stage toolchain.
COPY package.json package-lock.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
 && npm ci --omit=dev \
 && apk del .build-deps

COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
ENV ESTIMATE_DB_PATH=/data/estimate.db
ENV ESTIMATE_HTTP_PORT=24880
ENV ESTIMATE_DISABLE_STDIO=1

VOLUME /data
EXPOSE 24880

CMD ["node", "dist/index.js"]
