#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ELECTRON_ENTRY="${APP_ROOT}/dist-electron/main.js"

if [[ ! -f "${ELECTRON_ENTRY}" ]]; then
  echo "[pnet-tool] dist-electron/main.js 未找到，请先运行 \"pnpm run build:electron\" 或 \"pnpm run watch:electron\"" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[pnet-tool] 未找到 pnpm，请确保已安装并在 PATH 中" >&2
  exit 1
fi

exec pnpm --dir "${APP_ROOT}" exec electron "${ELECTRON_ENTRY}" "$@"
