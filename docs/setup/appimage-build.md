# AppImage 打包指南

本页介绍如何将 PNET Tool 构建为 Linux AppImage，并在安装后自动注册 `telnet://` 协议处理程序。

## 先决条件

- 已安装 Node.js 与 pnpm（开发流程沿用仓库根目录的 `.nvmrc`/`package.json` 要求）。
- 系统具备 FUSE 支持，用于挂载 AppImage（大部分桌面发行版默认已提供）。
- 可选：`libfuse2`（部分基于 Debian/Ubuntu 的系统在运行 AppImage 时需要手动安装）。

## 一键打包

```bash
pnpm install
pnpm run dist:appimage
```

该命令执行以下步骤：

1. **静态导出 Next.js 渲染层** —— 在环境变量 `PNET_ELECTRON_EXPORT=1` 下运行 `next build` 和 `next export`，生成 `dist-electron/renderer/` 目录。
2. **编译 Electron 主/预加载进程** —— 使用 TypeScript 编译器输出 `dist-electron/main.js` 与 `preload.js`。
3. **调用 electron-builder** —— 基于 `electron-builder.yml` 生成 `release/PNET Tool-<version>.AppImage`。

## 协议注册

- `electron-builder.yml` 中的 `protocols` 与 `.desktop` 配置会在 AppImage 集成时声明 `x-scheme-handler/telnet`。
- 应用启动后，主进程会根据运行环境（包括 AppImage 的 `APPIMAGE` 环境变量）调用 `app.setAsDefaultProtocolClient("telnet", …)` 自动注册处理程序。
- 当用户通过文件管理器或 AppImageLauncher 将 AppImage 集成到系统菜单时，即可在浏览器中点击 `telnet://` 链接并直接唤起 PNET Tool。
- **注意**：如果仅双击运行 AppImage 而未执行“集成”操作，系统可能不会保存 `.desktop` 条目。此时需要手动复制 `packaging/arch/pnet-tool.desktop` 至 `~/.local/share/applications/`，或参考《docs/setup/manjaro-install.md》使用 PKGBUILD 进行安装。

## 产物位置

打包成功后，输出位于 `release/`：

- `PNET Tool-<version>.AppImage`
- `latest-linux.yml`（为将来自动更新做准备，可选）

若需要分发给终端用户，只需提供 `.AppImage` 文件。

## 常见问题

| 问题 | 解决方案 |
| --- | --- |
| 运行 AppImage 提示缺少 FUSE | 安装 `libfuse2`（Debian/Ubuntu），或使用 `AppImageLauncher`。 |
| 浏览器仍使用系统 Telnet 程序 | 确认首次启动应用后没有报错，可在 `~/.config/mimeapps.list` 检查 `x-scheme-handler/telnet=pnet-tool.desktop`。 |
| `next export` 失败 | 确认所有页面都能静态预渲染；必要时检查 `generateStaticParams` 与动态路由。 |

## 后续优化建议

- 替换默认 Electron 图标：将 `build/icon.png`、`build/icons/` 等资源替换为自定义品牌素材。
- 配置 CI/CD：在 CI 中执行 `pnpm run dist:appimage` 并上传产物，可自动化发行流程。
- 支持多架构：在 `electron-builder.yml` 中追加 `arm64` 架构条目，以便打包 ARM 平台 AppImage。
