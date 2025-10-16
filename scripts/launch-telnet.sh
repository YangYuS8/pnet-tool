#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Prefer locally built Tauri binaries for dev, fallback to packaged ones
CANDIDATES=(
  "${APP_ROOT}/src-tauri/target/debug/pnet-tool"
  "${APP_ROOT}/src-tauri/target/release/pnet-tool"
  "${APP_ROOT}/release/linux-unpacked/pnet-tool"
)

BIN=""
for c in "${CANDIDATES[@]}"; do
  if [[ -x "$c" ]]; then
    BIN="$c"
    break
  fi
done

if [[ -z "$BIN" ]]; then
  # Try AppImage in release directory
  APPIMAGE_CANDIDATE=$(ls -1 "${APP_ROOT}/release"/pnet-tool-*.AppImage 2>/dev/null | head -n1 || true)
  if [[ -n "$APPIMAGE_CANDIDATE" && -f "$APPIMAGE_CANDIDATE" ]]; then
    chmod +x "$APPIMAGE_CANDIDATE" || true
    BIN="$APPIMAGE_CANDIDATE"
  fi
fi

if [[ -z "$BIN" ]]; then
  echo "[pnet-tool] 未找到可执行的 Tauri 二进制，请先运行一次 \"pnpm dev\" 或 \"pnpm build:deb\" 生成二进制后再试。" >&2
  exit 1
fi

exec "$BIN" "$@"
