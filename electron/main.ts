import path from "node:path";
import { app, BrowserWindow, ipcMain, nativeTheme, shell } from "electron";

const isDev = !app.isPackaged || process.env.NODE_ENV === "development";

let mainWindow: BrowserWindow | null = null;

function createMainWindow() {
  const preloadPath = path.join(__dirname, "preload.js");

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 640,
    title: "PNET Tool",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0f1115" : "#f5f5f5",
    titleBarStyle: "hiddenInset",
    vibrancy: process.platform === "darwin" ? "under-window" : undefined,
    trafficLightPosition: process.platform === "darwin" ? { x: 14, y: 16 } : undefined,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  const devServerURL = process.env.ELECTRON_START_URL ?? "http://localhost:3000";

  if (isDev) {
    mainWindow
      .loadURL(devServerURL)
      .catch((error) => console.error("Failed to load renderer:", error));
  } else {
    const rendererIndex = path.join(__dirname, "../renderer/index.html");
    mainWindow
      .loadFile(rendererIndex)
      .catch((error) => console.error("Failed to load renderer:", error));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch((error) => {
      console.error("Failed to open external url", url, error);
    });
    return { action: "deny" };
  });
}

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

ipcMain.handle("app:get-version", () => app.getVersion());
ipcMain.handle("app:ping", () => "pong");
