#!/bin/sh
set -e
APPDIR="/opt/pnet-tool"
APPIMAGE="$APPDIR/pnet-tool.AppImage"
if [ ! -x "$APPIMAGE" ]; then
  echo "pnet-tool: 未找到 AppImage：$APPIMAGE" >&2
  exit 1
fi
exec "$APPIMAGE" "$@"
