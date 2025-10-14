#!/usr/bin/env bash
set -euo pipefail

APP_ID="com.yangyus8.pnettool"
APP_NAME="PNET Tool"
BIN_SRC="$(dirname "$0")/../src-tauri/target/release/pnet-tool"
USER_BIN="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"
ICON_SRC="$(dirname "$0")/../build/icons/pnet-tool.png"
ICON_DST="$HOME/.local/share/icons/hicolor/256x256/apps/pnet-tool.png"

if [[ ! -f "$BIN_SRC" ]]; then
  echo "Binary not found at: $BIN_SRC" >&2
  echo "Build it first: pnpm build (or pnpm run build:web && pnpm exec tauri build --bundles none)" >&2
  exit 1
fi

mkdir -p "$USER_BIN" "$DESKTOP_DIR" "$(dirname "$ICON_DST")"

install -Dm755 "$BIN_SRC" "$USER_BIN/pnet-tool"

if [[ -f "$ICON_SRC" ]]; then
  install -Dm644 "$ICON_SRC" "$ICON_DST"
else
  echo "Icon not found at: $ICON_SRC (skipping icon install)"
fi

DESKTOP_FILE="$DESKTOP_DIR/pnet-tool.desktop"
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=$APP_NAME
Comment=PNETLab Telnet client and utilities
Exec=$USER_BIN/pnet-tool
Icon=pnet-tool
Terminal=false
Categories=Utility;Network;
StartupWMClass=pnet-tool
X-AppImage-Integrate=false
EOF

update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true

echo "Installed: $USER_BIN/pnet-tool"
echo "Desktop entry: $DESKTOP_FILE"
echo "Icon: $ICON_DST"
echo "You can now search for '$APP_NAME' in your app launcher."
