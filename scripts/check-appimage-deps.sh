#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

ok() { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err() { echo -e "${RED}[ERR]${NC} $*"; }

need_cmd() {
  if command -v "$1" >/dev/null 2>&1; then ok "$1 present"; else err "$1 missing"; return 1; fi
}

echo "Checking core tools..."
need_cmd patchelf || true
need_cmd desktop-file-validate || true
need_cmd appstreamcli || true
need_cmd update-desktop-database || true
need_cmd tar || true
need_cmd file || true

echo "\nChecking FUSE/AppImage support..."
if command -v appimagetool >/dev/null 2>&1; then ok "appimagetool present"; else warn "appimagetool missing (optional)"; fi
if command -v fusermount >/dev/null 2>&1; then ok "fusermount present"; else err "fusermount missing (install fuse2 / fuse)"; fi

# Check if /dev/fuse exists
if [[ -e /dev/fuse ]]; then ok "/dev/fuse exists"; else err "/dev/fuse not present (load fuse kernel module)"; fi

# Check SUID on fusermount (often required)
if command -v fusermount >/dev/null 2>&1; then
  if ls -l "$(command -v fusermount)" | grep -q 's'; then ok "fusermount has suid bit"; else warn "fusermount may lack suid (some distros require it)"; fi
fi

echo "\nChecking GTK/WebKit related headers (optional for bundling)..."
for pkg in gtk+-3.0 webkit2gtk-4.1; do
  if pkg-config --exists "$pkg"; then ok "$pkg (pkg-config)"; else warn "$pkg not found in pkg-config (may still be runtime-only)"; fi
done

echo "\nSummary:" 
echo "- Ensure packages installed: patchelf, desktop-file-utils, appstream (appstreamcli), fuse2 (or fuse), librsvg"
echo "- Ensure /dev/fuse exists and fusermount is usable (suid if needed)"
echo "- Re-run: pnpm run build:appimage"
