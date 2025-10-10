# Windows 构建指引（实验性）

本指南描述如何在 Windows x64 环境下构建 PNET Tool 的 NSIS 安装包。当前适配仍处于最小可行阶段，主要用于功能验证。

## 环境要求

- Windows 10/11 x64。
- [Node.js](https://nodejs.org/) 18+（自带 npm）。
- [PNPM](https://pnpm.io/) 9+ 已全局安装。
- Visual Studio 2019/2022 Build Tools（含 `Desktop development with C++` 工作负载，用于 `node-pty` 编译）。
- PowerShell 或适配的终端工具。

> 备注：首次安装依赖时，`pnpm install` 会触发 `electron-rebuild` 重编译 `node-pty`，需要数分钟时间。

## 构建流程

```powershell
pnpm install
pnpm run build        # 构建 Next.js 导出与 Electron 主进程
pnpm run dist:win     # 生成 NSIS 安装包（x64）
```

构建完成后，安装包将输出至 `release/` 目录，命名为 `PNET Tool-<version>-setup.exe`。

## 安装与验证

1. 运行生成的安装包，建议选择“自定义安装”以确认安装目录。
2. 安装结束后，开始菜单与桌面会创建快捷方式。
3. 应用首次启动时会注册 `telnet://` 协议。可在 PowerShell 中执行 `start telnet://192.0.2.1` 验证是否唤起应用。

## 已知限制

- 当前未提供代码签名，安装时可能出现 SmartScreen 提示，需要手动允许。
- 仅编译 x64 版本；ARM64 与 IA32 暂未规划。
- 自动更新通道尚未启用，需手动下载新版本。

后续将根据 0.1.6 迭代计划补充更多 Windows 专属优化（系统托盘、任务栏跳转列表等）。
