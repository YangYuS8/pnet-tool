#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="pnet-telnet"
DEFAULT_PREFIX="/usr/local"
USER_PREFIX="$HOME/.local"
PREFIX=${PREFIX:-$DEFAULT_PREFIX}
CONFIG_DIR_DEFAULT="$HOME/.config/pnet-telnet"
CONFIG_DIR=${CONFIG_DIR:-$CONFIG_DIR_DEFAULT}
CONFIG_FILE="$CONFIG_DIR/config"
DESKTOP_USER="$HOME/.local/share/applications/pnet-telnet.desktop"
DESKTOP_SYSTEM="/usr/share/applications/pnet-telnet.desktop"
HANDLER=${HANDLER:-1}
TERM_BIN_DEFAULT="kitty"
LOG_DIR="$HOME/pnetlab-logs"

usage() {
  cat <<EOF
$APP_NAME unified installer

Usage:
  $0 install [--prefix DIR] [--terminal NAME] [--no-handler|--handler] [--user] [--force]
  $0 uninstall [--prefix DIR] [--user] [--purge]
  $0 configure [--terminal NAME]
  $0 show

Options env overrides:
  PREFIX=/custom/path           (default: $DEFAULT_PREFIX)
  TERM_BIN=kitty|wezterm|xterm  (default: $TERM_BIN_DEFAULT)
  HANDLER=0                     Skip telnet:// handler registration (default 1)
  FORCE=1                       Overwrite existing install
  USER=1                        Force user-local install (no root) (/usr/local otherwise)

Examples:
  TERM_BIN=wezterm $0 install --user
  PREFIX=/opt/tools $0 install --no-handler
  $0 uninstall --purge

Interactive mode:
  Run '$0' with no arguments to open a numbered menu.
EOF
}

need_cmd(){ command -v "$1" >/dev/null 2>&1 || { echo "[ERR] missing dependency: $1" >&2; exit 2; }; }

detect_terminal() {
  if [[ -n ${TERM_BIN:-} ]]; then echo "$TERM_BIN"; return; fi
  for c in kitty wezterm alacritty gnome-terminal xterm; do command -v "$c" >/dev/null 2>&1 && { echo "$c"; return; }; done
  echo "$TERM_BIN_DEFAULT"
}

require_root_if_system() {
  if [[ ${USER_INSTALL:-0} -eq 1 ]]; then return; fi
  if [[ $PREFIX != /usr/local && ! -w "$PREFIX" ]]; then
    echo "[!] Need write permission to $PREFIX (re-run with sudo or set USER=1)." >&2; exit 3
  fi
  if [[ $PREFIX == /usr/local && ! -w "$PREFIX/bin" ]]; then
    echo "[!] /usr/local/bin not writable; use sudo or USER=1." >&2; exit 3
  fi
}

install_bin() {
  local term_bin="$1"
  mkdir -p "$CONFIG_DIR" "$LOG_DIR"
  # Copy script
  local target="$PREFIX/bin/$APP_NAME"
  if [[ -e $target && ${FORCE:-0} -ne 1 ]]; then
    if cmp -s "$SCRIPT_DIR/$APP_NAME" "$target"; then
      echo "[OK] Already up to date: $target"
      return 0
    fi
    echo "[!] $target exists (use FORCE=1 or --force to overwrite)"; exit 4
  fi
  install -Dm755 "$SCRIPT_DIR/$APP_NAME" "$target"
  echo "[OK] Installed binary: $target"
  # Config
  if [[ ! -f $CONFIG_FILE ]]; then
    cat > "$CONFIG_FILE" <<CFG
TERM_BIN=$term_bin
LOG_TRUNCATE=1
FOCUS_EXISTING=1
FRESH_ON_FOCUS=1
AUTO_RECONNECT=0
RECONNECT_DELAY=5
USE_EXPECT=0
CFG
    echo "[OK] Wrote config: $CONFIG_FILE"
  else
    echo "[SKIP] Config exists: $CONFIG_FILE"
  fi
  # Desktop handler (user scope recommended)
  if [[ $HANDLER -eq 1 ]]; then
    local desktop_dest
    if [[ ${USER_INSTALL:-0} -eq 1 ]]; then
      desktop_dest="$DESKTOP_USER"
    else
      desktop_dest="$DESKTOP_SYSTEM"
    fi
    # 动态生成 desktop 以匹配安装模式
    if [[ ${USER_INSTALL:-0} -eq 1 ]]; then
      # 使用 PATH 查找，避免硬编码绝对路径
      sed "s|^Exec=.*|Exec=pnet-telnet %u|" "$SCRIPT_DIR/pnet-telnet.desktop" > "$desktop_dest"
    else
      # 系统模式写入绝对路径（更可靠）
      sed "s|^Exec=.*|Exec=$PREFIX/bin/pnet-telnet %u|" "$SCRIPT_DIR/pnet-telnet.desktop" > "$desktop_dest"
    fi
    chmod 644 "$desktop_dest"
    if command -v xdg-mime >/dev/null 2>&1; then
      # 某些精简系统缺少 qtpaths, xdg-mime 会打印警告；我们捕获退出码并继续
      if ! xdg-mime default pnet-telnet.desktop x-scheme-handler/telnet 2>"$LOG_DIR/xdg-mime.log"; then
        echo "[WARN] xdg-mime registration had warnings (see $LOG_DIR/xdg-mime.log). You may ignore if telnet links still open." >&2
      fi
    else
      echo "[INFO] xdg-mime not found; skipped automatic telnet handler association" >&2
    fi
    if command -v update-desktop-database >/dev/null 2>&1; then
      update-desktop-database "$(dirname "$desktop_dest")" >/dev/null 2>&1 || true
    fi
    echo "[OK] Handler registered (desktop entry: $desktop_dest)"
  else
    echo "[INFO] Telnet handler registration skipped (HANDLER=0)"
  fi
}

uninstall_all() {
  local target="$PREFIX/bin/$APP_NAME"
  local desktop_user="$DESKTOP_USER"
  local desktop_sys="$DESKTOP_SYSTEM"
  [[ -f $target ]] && { rm -f "$target" && echo "[OK] Removed $target"; }
  [[ -f $desktop_user ]] && { rm -f "$desktop_user" && echo "[OK] Removed $desktop_user"; }
  [[ -f $desktop_sys ]] && { rm -f "$desktop_sys" && echo "[OK] Removed $desktop_sys"; }
  if [[ ${PURGE:-0} -eq 1 ]]; then
    rm -rf "$CONFIG_DIR"
    echo "[OK] Purged config dir $CONFIG_DIR"
  fi
}

configure_terminal() {
  local term_bin="$1"
  mkdir -p "$CONFIG_DIR"
  if grep -q '^TERM_BIN=' "$CONFIG_FILE" 2>/dev/null; then
    sed -i "s/^TERM_BIN=.*/TERM_BIN=$term_bin/" "$CONFIG_FILE"
  else
    echo "TERM_BIN=$term_bin" >> "$CONFIG_FILE"
  fi
  echo "[OK] Updated TERM_BIN=$term_bin in $CONFIG_FILE"
}

show_info() {
  echo "Binary: $PREFIX/bin/$APP_NAME (exists: $( [[ -x $PREFIX/bin/$APP_NAME ]] && echo yes || echo no ))"
  echo "Config : $CONFIG_FILE (exists: $( [[ -f $CONFIG_FILE ]] && echo yes || echo no ))"
  echo "Desktop(user): $DESKTOP_USER (exists: $( [[ -f $DESKTOP_USER ]] && echo yes || echo no ))"
  echo "Desktop(sys) : $DESKTOP_SYSTEM (exists: $( [[ -f $DESKTOP_SYSTEM ]] && echo yes || echo no ))"
}

interactive_menu() {
  echo "==== $APP_NAME Interactive Menu ===="
  echo "(Handler current: $([[ $HANDLER -eq 1 ]] && echo ON || echo OFF))"
  while true; do
    echo "";
    cat <<MENU
1) Install (user/local)
2) Install (system)
3) Uninstall (user/local)
4) Uninstall (system)
5) Configure terminal
6) Show info
7) Toggle handler (current: $([[ $HANDLER -eq 1 ]] && echo ON || echo OFF))
8) Exit
MENU
    read -rp "Select [1-8]: " choice || exit 0
    case "$choice" in
      1)
        USER_INSTALL=1; PREFIX="$USER_PREFIX"; TERM_BIN=$(detect_terminal)
        require_root_if_system || true
        install_bin "$TERM_BIN";;
      2)
        USER_INSTALL=0; PREFIX="$DEFAULT_PREFIX"; TERM_BIN=$(detect_terminal)
        require_root_if_system
        install_bin "$TERM_BIN";;
      3)
        USER_INSTALL=1; PREFIX="$USER_PREFIX"; uninstall_all;;
      4)
        USER_INSTALL=0; PREFIX="$DEFAULT_PREFIX"; uninstall_all;;
      5)
        read -rp "Terminal name (blank=auto-detect): " tname
        if [[ -n $tname ]]; then TERM_BIN="$tname"; else TERM_BIN=$(detect_terminal); fi
        configure_terminal "$TERM_BIN";;
      6)
        show_info;;
      7)
        if [[ $HANDLER -eq 1 ]]; then HANDLER=0; else HANDLER=1; fi
        echo "Handler now: $([[ $HANDLER -eq 1 ]] && echo ON || echo OFF) (takes effect on next install)";;
      8|q|Q)
        echo "Bye."; exit 0;;
      *)
        echo "Invalid choice";;
    esac
  done
}

ACTION=${1:-}
if [[ -z ${ACTION} ]]; then
  # No arguments -> interactive mode
  interactive_menu
  exit 0
fi
shift || true

USER_INSTALL=${USER_INSTALL:-0}

# Parse simple flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prefix) PREFIX="$2"; shift 2;;
    --terminal) TERM_BIN="$2"; shift 2;;
  --no-handler) HANDLER=0; shift;;
  --handler) HANDLER=1; shift;;
  --user) USER_INSTALL=1; PREFIX="$USER_PREFIX"; shift;;
    --force) FORCE=1; shift;;
    --purge) PURGE=1; shift;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1"; usage; exit 1;;
  esac
done

TERM_BIN=$(detect_terminal)

case "$ACTION" in
  install)
    # 如果是用户模式则重写 PREFIX & 路径
    if [[ $USER_INSTALL -eq 1 ]]; then
      PREFIX="$USER_PREFIX"
      mkdir -p "$PREFIX/bin"
    fi
    require_root_if_system
    install_bin "$TERM_BIN"
    # PATH 提示：如果用户安装并且 ~/.local/bin 不在 PATH
    if [[ $USER_INSTALL -eq 1 ]]; then
      case ":$PATH:" in
        *":$HOME/.local/bin:"*) :;;
        *) echo "[HINT] Add '$HOME/.local/bin' to PATH, e.g.: export PATH=\"$HOME/.local/bin:\$PATH\"" ;; 
      esac
    fi
    ;;
  uninstall)
    uninstall_all
    ;;
  configure)
    configure_terminal "$TERM_BIN"
    ;;
  show)
    show_info
    ;;
  *)
    usage; exit 1;
    ;;
esac

echo "Done." 