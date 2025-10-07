# 在 Linux (Manjaro/Arch) 上将 `telnet://` 协议绑定到 PNET Tool

> **提示**：如果你通过本文仓库提供的 AppImage 安装 PNET Tool，并按照 `docs/setup/appimage-build.md` 打包/集成，`telnet://` 协议会在首次运行时自动注册，本页更多用于开发环境或手动调试。

由于 Linux 桌面环境依赖 `.desktop` 条目与 `xdg-mime`，Electron 在开发模式下无法像 Windows / macOS 那样自动声明 `telnet://` 处理程序。下面提供一套 **无需打包** 的注册脚本，帮助你让 Chrome 等浏览器里的 `telnet://` 链接改由正在开发的 PNET Tool 接管。

> ⚠️ 注意：以下步骤假定你使用 `pnpm dev:desktop` 启动过 Electron，并保持其运行。Chrome 调起时，如果 PNET Tool 尚未启动，则会自动拉起 Electron 实例，但仍需 Next.js 开发服务可用。

---

## 1. 生成 `.desktop` 启动器

在项目根目录运行：

```bash
pnpm exec node ./scripts/install-telnet-handler.mjs
```

脚本会：

1. 在 `~/.local/share/applications/` 写入 `pnet-tool-telnet.desktop`；
2. 将 `telnet://` 协议默认处理程序设置为该条目；
3. 触发 `update-desktop-database` 刷新缓存（若工具可用）。

安装后可通过以下命令确认：

```bash
xdg-mime query default x-scheme-handler/telnet
```

若输出 `pnet-tool-telnet.desktop` 即表示绑定成功。

---

## 2. 工作原理与要求

- `.desktop` 的 `Exec` 指向脚本 `scripts/launch-telnet.sh`，该脚本会：
  - 检查项目内的 Electron/Next 进程是否已就绪；
  - 若 Electron 尚未运行，使用与 `pnpm dev:desktop` 相同的入口拉起；
  - 把 `telnet://` 参数透传给主进程，在 `second-instance` 钩子内交给现有窗口处理。
- 主进程在启动时会消费 `process.argv`、`second-instance`、`open-url`（macOS）事件，将外部请求封装后转发给渲染进程，由前端的 `TelnetTerminal` 自动触发连接。

> ✅ 若 Electron 已在运行，`Exec` 启动的“第二实例”会很快退出，但参数已传达给首个实例；这样无需手动切换终端窗口。

---

## 3. 恢复系统默认行为

若后续想还原为系统默认终端，只需执行：

```bash
xdg-mime default org.gnome.Terminal.desktop x-scheme-handler/telnet
# 或者换成你的终端对应的 .desktop 文件
```

同时删除 `~/.local/share/applications/pnet-tool-telnet.desktop` 即可。

---

## 常见问题

- **Chrome 仍然弹出“打开系统终端”并无视设置？**
  - 请确认 Chrome → 设置 → 隐私与安全 → 网站设置 → 其他权限 → 协议处理程序 中允许网站发起请求；
  - 若系统曾记住“始终使用某终端打开”，可在该界面清除默认设置后重新点击。
- **脚本提示 `update-desktop-database` 不存在？**
  - 该命令非必需，可通过 `sudo pacman -S desktop-file-utils` 安装；脚本失败不会影响协议绑定本身。
- **想在打包后的 AppImage/应用中使用？**
  - 打包版本会自动调用 `setAsDefaultProtocolClient`；也可复用上述 `.desktop` 模板，将 `Exec` 替换为正式包路径即可。
