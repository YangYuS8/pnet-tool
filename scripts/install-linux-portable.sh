#!/usr/bin/env bash
set -euo pipefail

# Thin wrapper to reuse existing user-level installer
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LEGACY="$SCRIPT_DIR/install-linux.sh"

if [[ -x "$LEGACY" ]]; then
  exec "$LEGACY"
else
  echo "install-linux.sh not found at $LEGACY" >&2
  echo "Please build first and install manually:" >&2
  echo "  cp src-tauri/target/release/pnet-tool ~/.local/bin/ && chmod +x ~/.local/bin/pnet-tool" >&2
  exit 1
fi
