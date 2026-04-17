#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required."
  echo "Install Node.js 22 LTS from https://nodejs.org/en/download"
  echo "npm is bundled with Node.js. This project uses React + Vite, not Next.js."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not available in PATH."
  echo "Reinstall Node.js 22 LTS from https://nodejs.org/en/download"
  echo "This project uses React + Vite, not Next.js."
  exit 1
fi

if ! node -e "const [major, minor, patch] = process.versions.node.split('.').map(Number); const ok = major > 20 || (major === 20 && (minor > 19 || (minor === 19 && patch >= 0))); process.exit(ok ? 0 : 1)"; then
  echo "Node.js 20.19.0+ is required."
  echo "Install Node.js 22 LTS from https://nodejs.org/en/download"
  exit 1
fi

exec node "$ROOT_DIR/scripts/start.mjs"
