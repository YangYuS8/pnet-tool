# 在 Manjaro / Arch 系统上安装 PNET Tool

本文提供两种推荐方案：直接集成 AppImage，或使用 PKGBUILD 构建可安装的系统包。

## 方案一：手动集成 AppImage

1. 将 `PNET Tool-<version>.AppImage` 下载到任意目录并添加执行权限：
   ```bash
   chmod +x "PNET Tool-<version>.AppImage"
   ./"PNET Tool-<version>.AppImage"
   ```
2. 首次运行会在 `~/.config/PNET Tool/` 等位置初始化数据，但不会自动写入系统协议。
3. 如需手动注册 `telnet://` 处理程序，可执行：
   ```bash
   mkdir -p ~/.local/share/applications
   cp packaging/arch/pnet-tool.desktop ~/.local/share/applications/
   xdg-mime default pnet-tool.desktop x-scheme-handler/telnet
   update-desktop-database ~/.local/share/applications
   ```
   - 如果 AppImage 位于非标准路径，可将 `Exec` 行改为 `Exec=/完整路径/PNET Tool-<version>.AppImage %u`。
4. 重新启动浏览器后，即可通过 `telnet://` 链接唤起 PNET Tool。

> 使用 [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) 等工具进行“集成”，也会自动复制 `.desktop` 文件并刷新 MIME 数据库，通常能一步完成注册。

## 方案二：使用 PKGBUILD 构建系统包

仓库内置了 `packaging/arch/PKGBUILD`，打包逻辑如下：
- clone 当前仓库源码并执行 `pnpm install` / `pnpm run dist:appimage` 生成最新 AppImage。
- 将产物安装至 `/opt/pnet-tool/pnet-tool.AppImage` 并写入 `/usr/bin/pnet-tool` 启动器；
- 安装品牌图标与 `.desktop` 条目，并在 `post_install` 阶段调用 `xdg-mime` 绑定 `telnet://` 协议。

### 构建步骤
1. 安装构建依赖：`sudo pacman -S --needed base-devel git nodejs pnpm python`。
2. 在仓库根目录执行：
   ```bash
   cd packaging/arch
   makepkg -si
   ```
3. 安装完成后，可运行 `xdg-mime query default x-scheme-handler/telnet` 以确认绑定已指向 `pnet-tool.desktop`。
4. 如需卸载：
   ```bash
   sudo pacman -R pnet-tool
   ```
   卸载脚本会保留当前 MIME 绑定设置，如需恢复系统默认终端，可执行：
   ```bash
   xdg-mime default org.gnome.Terminal.desktop x-scheme-handler/telnet
   ```

> 构建过程默认使用仓库内的 AppImage 图标与 README 作为文档，可按需替换 `build/icons/pnet-tool.svg` 或追加许可文件。
