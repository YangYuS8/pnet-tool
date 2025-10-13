## 项目概览

PNET Tool 是一个结合 Next.js 15 与 Tauri 2 的桌面端应用，用于对接 PNETLab 模拟器的路由设备命令窗口。界面使用 Tailwind CSS 4 与 shadcn/ui 组件体系，默认亮色主题并支持暗色切换。
- 会话面板：左侧纵向列表集中展示当前会话，可快速切换、重命名并查看运行状态。
- 协议唤起：注册 `telnet://` 协议，支持从浏览器点击 PNETLab 拓扑节点后唤起桌面端并自动连接。
- 配置检测：通过 `/api/pnetlab/health` 探测 PNETLab 连通性并反馈响应时延。
- 双语界面：支持 `zh-CN` 与 `en` 两种语言，通过 `/[locale]` 路径访问并在客户端即时切换。
- 桌面壳层：定制化窗口标题栏、主题切换与 IPC 桥接，统一桌面视觉风格。

## 快速开始

安装依赖：

```bash
```

仅启动 Web 端（调试 UI）：
```bash
pnpm dev
```

启动桌面端一体化调试（Next.js + Tauri）：

```bash
pnpm dev
```

构建产物：

```bash
pnpm build             # 构建 Tauri 桌面版（包含静态渲染层导出）
pnpm build:web         # 仅构建 Next.js 静态导出
```

更多打包细节见 `docs/setup/appimage-build.md` 与 `docs/setup/windows-build.md`。

## 目录指引

- `app/`：Next.js App Router 页面与 API。`app/page.tsx` 自动重定向至默认语言路径，`app/[locale]/page.tsx` 提供现代化仪表盘 UI，`app/api/pnetlab/health` 执行连通性检测。
- `components/`：前端组件与主题封装，包含 shadcn 风格的 Button/Input/Card 等基础组件。
- `src-tauri/`：Tauri 主进程与配置。
- `docs/`：平台相关的外部脚本与文档。

## 下一步路线

- 完成 Arch/Manjaro 的 `PKGBUILD`、post-install 与协议注册脚本，打磨 Linux 发行体验。
- 编写 AppImage / PKGBUILD / Windows NSIS 的安装与故障排查指南，补齐图文文档。
- 强化 Telnet 终端的断线检测、日志导出与多会话持久化能力。
- 评估并引入轻量 CI，自动构建试玩包并回归 `telnet://` 唤起流程。

欢迎根据实际需求继续拓展功能。通过持续迭代，我们将把 PNET Tool 打造成面向网络实验室的高效 Telnet 桌面客户端。
