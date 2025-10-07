## 项目概览

PNET Tool 是一个结合 Next.js 15 与 Electron 38 的桌面端应用雏形，用于对接 PNETLab 模拟器的路由设备命令窗口。界面使用 Tailwind CSS 4 与 shadcn/ui 组件体系，默认亮色主题并支持暗色切换。

当前实现的核心能力：

- UI 布局：左侧为 PNETLab 配置面板，右侧为未来的终端工作区，占位设计参考 SecureFX。
- 配置检测：可输入 PNETLab 的 IP/端口，通过服务器端 API (`/api/pnetlab/health`) 快速探测连通性并反馈响应时延。
- 双语界面：支持 `zh-CN` 与 `en` 两种语言，通过 `/[locale]` 路径访问并在客户端使用语言开关即时切换。
- 桌面框架：引入 Electron 主进程与预加载脚本，为后续 Telnet 会话与 IPC 奠定基础。

## 快速开始

安装依赖：

```bash
pnpm install
```

仅启动 Web 端（调试 UI）：

```bash
pnpm dev
```

启动桌面端一体化调试（Next.js + Electron + TypeScript watch）：

```bash
pnpm dev:desktop
```

构建产物：

```bash
pnpm build       # 构建 Electron 桌面版（含静态渲染层）
pnpm build:web   # 仅构建 Next.js
pnpm build:electron
pnpm run dist:appimage  # 产出 Linux AppImage 安装包
```

更多打包细节见 `docs/setup/appimage-build.md`。

## 目录指引

- `app/`：Next.js App Router 页面与 API。`app/page.tsx` 自动重定向至默认语言路径，`app/[locale]/page.tsx` 提供现代化仪表盘 UI，`app/api/pnetlab/health` 执行连通性检测。
- `components/`：前端组件与主题封装，包含 shadcn 风格的 Button/Input/Card 等基础组件。
- `electron/`：Electron 主进程与预加载脚本，TypeScript 通过独立的 `electron/tsconfig.json` 构建至 `dist-electron/`。
- `docs/`：平台相关的外部脚本与文档。

## 下一步路线

- 集成 node-pty + xterm.js，构建高性能 Telnet 终端体验。
- 监听 PNETLab 网页事件，实现点击设备后自动打开对应会话。
- 引入多会话管理、窗口布局（Tabs/Pane）与连接守护进程。

欢迎根据实际需求继续拓展功能。系统化的敏捷迭代建议：先打通 Telnet 管道，再完善自动唤醒与 UI/UX 细节。
