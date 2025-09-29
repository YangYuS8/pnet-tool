<div align="center">

# pnet-telnet
轻量级 PnetLab / 浏览器 telnet:// 链接终端调度器（kitty 优先），支持窗口复用、日志截断、自动重连、Expect 初始化注入与跨平台（Linux + Windows 原型）安装脚本。

</div>

---

## 目录
1. 功能概览  
2. 快速开始  
3. 安装（Linux / Windows）  
4. 配置文件与环境变量  
5. 使用示例  
6. Expect 初始命令注入  
7. 日志与窗口复用机制  
8. 批量多会话 (可选)  
9. 卸载 / 清理  
10. 故障排查 (FAQ)  
11. Roadmap  
12. License & English Summary

---

## 1. 功能概览
| 功能 | 描述 |
|------|------|
| telnet URL 处理 | 注册为 `telnet://IP:PORT` 链接处理器（桌面环境支持） |
| 终端可选 | `TERM_BIN`：kitty / wezterm / alacritty / gnome-terminal / xterm (自动探测) |
| 窗口复用 | 同 host:port 再次点击可聚焦或“关闭+重建”清屏 (`FOCUS_EXISTING` + `FRESH_ON_FOCUS`) |
| 日志截断 | 每次打开重置对应 `~/pnetlab-logs/host_port.log` (`LOG_TRUNCATE=1`) |
| 自动重连 | `AUTO_RECONNECT=1`；间隔 `RECONNECT_DELAY` 秒 |
| Expect 注入 | `USE_EXPECT=1`，初始命令自动发送，支持文件或 inline |
| tmux 集成 | `USE_TMUX=1` 汇聚会话到 tmux session |
| nc 替代 | `TELNET_IMPL=nc` 走 netcat 原始连接 |
| 配置文件 | `~/.config/pnet-telnet/config` 统一默认值 |
| Windows 原型 | PowerShell 安装脚本 + `pnet-telnet.cmd` 占位启动器 |
| 安装脚本 | `setup-linux.sh` / `setup-win.ps1`：install / uninstall / configure / show |

> 已移除：别名映射（简化交互）。

---

## 2. 快速开始
```bash
# 依赖 (Arch / Manjaro)
sudo pacman -S --needed kitty inetutils tmux

# 用户本地安装（推荐）
chmod +x setup-linux.sh
./setup-linux.sh install --user --terminal kitty

# 测试
telnet://127.0.0.1:2001  # 浏览器地址栏 或
pnet-telnet 127.0.0.1:2001
```

---

## 3. 安装
### 3.1 Linux 脚本
```bash
./setup-linux.sh install --user --terminal kitty
./setup-linux.sh show
TERM_BIN=wezterm ./setup-linux.sh configure
./setup-linux.sh uninstall --user --purge
```
参数/环境：
| 选项 | 说明 |
|------|------|
| `--user` | 安装到 `~/.local/bin` 与本地 desktop entry |
| `--terminal <name>` | 指定终端覆盖自动探测 |
| `--no-handler` / `HANDLER=0` | 不注册 telnet 协议处理 |
| `--force` / `FORCE=1` | 覆盖已有文件 |
| `--prefix DIR` | 系统安装路径（非 `--user`） |
| `--purge` | 卸载时删除配置目录 |

### 3.2 手动安装
```bash
sudo install -m755 pnet-telnet /usr/local/bin/pnet-telnet
install -m644 -D pnet-telnet.desktop ~/.local/share/applications/pnet-telnet.desktop
xdg-mime default pnet-telnet.desktop x-scheme-handler/telnet
update-desktop-database ~/.local/share/applications || true
```

### 3.3 Windows 原型
```powershell
powershell -ExecutionPolicy Bypass -File .\setup-win.ps1 install -Terminal kitty
powershell -ExecutionPolicy Bypass -File .\setup-win.ps1 show
```
生成 `%USERPROFILE%\pnet-telnet.cmd` 占位启动器。

---

## 4. 配置文件与环境变量
配置文件：`~/.config/pnet-telnet/config`
示例：
```
TERM_BIN=kitty
LOG_TRUNCATE=1
FOCUS_EXISTING=1
FRESH_ON_FOCUS=1
AUTO_RECONNECT=0
RECONNECT_DELAY=5
USE_EXPECT=0
```
环境变量：
| 变量 | 默认 | 说明 |
|------|------|------|
| `TERM_BIN` | kitty | 终端程序 |
| `FOCUS_EXISTING` | 1 | 已有窗口聚焦/复用 |
| `FRESH_ON_FOCUS` | 1 | 复用时关闭旧窗口重建 |
| `LOG_TRUNCATE` | 1 | 每次重置日志 |
| `AUTO_RECONNECT` | 0 | 自动重连循环 |
| `RECONNECT_DELAY` | 5 | 重连等待秒 |
| `TELNET_IMPL` | telnet | 可设 `nc` 使用 netcat |
| `USE_TMUX` | 0 | tmux 模式 |
| `TMUX_SESSION` | pnet | tmux 会话名 |
| `USE_EXPECT` | 0 | 启用 Expect 注入 |
| `INIT_CMDS` | (空) | 内联命令（; 或换行） |
| `INIT_CMDS_FILE` | (空) | 命令文件（优先） |
| `INIT_DELAY` | 0.1 | 每条命令间隔 |
| `HOLD_ON_EXIT` | 0 | 单次会话结束保持 |
| `ALWAYS_HOLD` | 0 | 强制保持 |
| `KITTY_SOCKET` | /tmp/kitty-pnet.sock | 远程控制 socket |

---

## 5. 使用示例
```bash
# 基本
telnet://10.0.0.5:2003
pnet-telnet 10.0.0.5:2003

# 自动重连
AUTO_RECONNECT=1 RECONNECT_DELAY=3 pnet-telnet 10.0.0.5:2003

# 仅聚焦不重建
FRESH_ON_FOCUS=0 pnet-telnet 10.0.0.5:2003

# 使用 netcat
TELNET_IMPL=nc pnet-telnet 10.0.0.5:2003

# 汇聚到 tmux
USE_TMUX=1 TMUX_SESSION=lab pnet-telnet 10.0.0.5:2003

# Expect 注入
USE_EXPECT=1 INIT_CMDS='terminal length 0;show clock' pnet-telnet 10.0.0.5:2003
```

---

## 6. Expect 初始命令注入
支持：
1. `INIT_CMDS='cmd1;cmd2'`
2. `INIT_CMDS_FILE=/path/file`（忽略 `#` 开头与空行）

自动重连模式下每次重新建立连接都会重发。

---

## 7. 日志与窗口复用
| 项 | 说明 |
|----|------|
| 日志文件 | `~/pnetlab-logs/<host>_<port>.log` |
| 截断 | `LOG_TRUNCATE=1` 初次执行或替换时清空 |
| 复用 | kitty 远控匹配标题；`FRESH_ON_FOCUS=1` 关闭旧窗口再建新窗口 |
| 清屏 | 通过“重建窗口”从根源清除滚动缓冲 |

调试：`DEBUG=1` 可在脚本中追加调试日志（当前脚本中留接口，可按需加）。

---

## 8. 批量多会话 (可选)
如果保留了 `multi_login.sh` 与 `devices.txt`：
```bash
chmod +x multi_login.sh
./multi_login.sh devices.txt
```
关闭同步：`:setw synchronize-panes off`

不需要则删除这些文件即可。

---

## 9. 卸载 / 清理
脚本卸载：
```bash
./setup-linux.sh uninstall --user --purge
```
手动：
```bash
rm ~/.local/bin/pnet-telnet
rm ~/.local/share/applications/pnet-telnet.desktop
xdg-mime default firefox.desktop x-scheme-handler/telnet 2>/dev/null || true
```
Windows：
```powershell
powershell -ExecutionPolicy Bypass -File .\setup-win.ps1 uninstall -Purge
```

---

## 10. FAQ
| 问题 | 原因 | 解决 |
|------|------|------|
| 点击 telnet 链接无反应 | handler 未注册 | 重新执行安装脚本 / 检查 desktop entry |
| 窗口秒关 | 短连接 & 没有保持 | `HOLD_ON_EXIT=1` 或启用自动重连 |
| 缺少 `telnet` | 未安装 inetutils | 安装：`sudo pacman -S inetutils` |
| `qtpaths` 警告 | xdg-mime 依赖缺失 | 可忽略 |
| 复用失败 | 非 kitty 或 socket 不可用 | 保证 `TERM_BIN=kitty` 或关闭复用 |
| Expect 无效 | 未安装 expect | `sudo pacman -S expect` |

---

## 11. Roadmap
- Windows 真正 telnet / SSH 集成 (plink / busybox)。
- `ssh://` 支持与统一多协议。
- 日志轮换、归档策略。
- 可选 JSON / YAML 批量清单。
- Expect 登录模板库。
- Python / Go 跨平台重构。

---

## 12. License & English Summary
License: MIT

English Summary:
`pnet-telnet` is a lightweight telnet URL handler + session orchestrator (kitty-first) featuring window reuse, log truncation, auto reconnect, optional Expect init commands, tmux aggregation and cross-platform installer prototypes.

---

欢迎 issue / PR / 功能建议。
