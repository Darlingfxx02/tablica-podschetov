@echo off
setlocal

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required.
  echo Install Node.js 22 LTS from https://nodejs.org/en/download
  echo npm is bundled with Node.js. This project uses React + Vite, not Next.js.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not available in PATH.
  echo Reinstall Node.js 22 LTS from https://nodejs.org/en/download
  echo This project uses React + Vite, not Next.js.
  exit /b 1
)

node -e "const [major, minor, patch] = process.versions.node.split('.').map(Number); const ok = major > 20 || (major === 20 && (minor > 19 || (minor === 19 && patch >= 0))); process.exit(ok ? 0 : 1)" >nul 2>nul
if errorlevel 1 (
  echo Node.js 20.19.0+ is required.
  echo Install Node.js 22 LTS from https://nodejs.org/en/download
  exit /b 1
)

node "%~dp0scripts\start.mjs"
