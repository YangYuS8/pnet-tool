import { randomUUID } from "node:crypto";
import path from "node:path";
import { app, BrowserWindow, ipcMain, nativeTheme, shell } from "electron";
import type { IPty } from "node-pty";
import { spawn } from "node-pty";

const isDev = !app.isPackaged || process.env.NODE_ENV === "development";

let mainWindow: BrowserWindow | null = null;

type WindowStatePayload = {
  isMaximized: boolean;
  isFullScreen: boolean;
  isFocused: boolean;
};

function emitWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  const payload: WindowStatePayload = {
    isMaximized: mainWindow.isMaximized(),
    isFullScreen: mainWindow.isFullScreen(),
    isFocused: mainWindow.isFocused(),
  };
  mainWindow.webContents.send("window:state", payload);
}

type TerminalDimensions = {
  cols?: number;
  rows?: number;
};

type TerminalLaunchOptions = {
  host?: string;
  port?: number;
  dimensions?: TerminalDimensions;
};

type TerminalSession = {
  pty: IPty;
  sender: Electron.WebContents;
};

const terminalSessions = new Map<string, TerminalSession>();
type TelnetLaunchRequest = {
  host: string;
  port?: number;
};

const pendingTelnetRequests: TelnetLaunchRequest[] = [];
let telnetBridgeReady = false;

function enqueueTelnetRequest(request: TelnetLaunchRequest) {
  pendingTelnetRequests.push(request);
  dispatchTelnetRequests();
}

function dispatchTelnetRequests() {
  if (!telnetBridgeReady) {
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents || mainWindow.webContents.isDestroyed()) {
    return;
  }
  if (pendingTelnetRequests.length === 0) {
    return;
  }
  const payload = pendingTelnetRequests.splice(0, pendingTelnetRequests.length);
  mainWindow.webContents.send("telnet:requests", payload);
}

function parseTelnetUrl(rawUrl: string): TelnetLaunchRequest | null {
  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol !== "telnet:") {
      return null;
    }
    const host = url.hostname;
    if (!host) {
      return null;
    }
    const portNumber = url.port ? Number.parseInt(url.port, 10) : undefined;
    const normalizedPort =
      typeof portNumber === "number" && Number.isFinite(portNumber) && portNumber > 0
        ? portNumber
        : undefined;
    return {
      host,
      port: normalizedPort,
    };
  } catch (error) {
    console.warn("Failed to parse telnet url", rawUrl, error);
    return null;
  }
}

function ingestTelnetUrl(rawUrl: string) {
  const request = parseTelnetUrl(rawUrl);
  if (request) {
    enqueueTelnetRequest(request);
  }
}

function getDefaultShell() {
  if (process.platform === "win32") {
    return process.env.COMSPEC ?? "cmd.exe";
  }
  if (process.platform === "darwin") {
    return process.env.SHELL ?? "zsh";
  }
  return process.env.SHELL ?? "bash";
}

function getDefaultShellArgs() {
  if (process.platform === "win32") {
    return [];
  }
  return ["-l"];
}

function sanitizeDimension(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.floor(value);
  if (Number.isNaN(rounded)) {
    return fallback;
  }
  return Math.min(Math.max(rounded, minimum), maximum);
}

function disposeTerminalSession(id: string) {
  const session = terminalSessions.get(id);
  if (!session) {
    return false;
  }
  try {
    session.pty.kill();
  } catch (error) {
    console.error("Failed to dispose terminal session", id, error);
  }
  terminalSessions.delete(id);
  return true;
}

function createMainWindow() {
  const preloadPath = path.join(__dirname, "preload.js");

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 640,
    title: "PNET Tool",
    show: false,
    frame: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0f1115" : "#f5f5f5",
    vibrancy: process.platform === "darwin" ? "under-window" : undefined,
    trafficLightPosition: undefined,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  telnetBridgeReady = false;

  mainWindow.setMenuBarVisibility(false);

  const devServerURL = process.env.ELECTRON_START_URL ?? "http://localhost:3000";

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    emitWindowState();
  });

  const loadPromise = isDev
    ? mainWindow
        .loadURL(devServerURL)
        .catch((error) => console.error("Failed to load renderer:", error))
    : mainWindow
        .loadFile(path.join(__dirname, "../renderer/index.html"))
        .catch((error) => console.error("Failed to load renderer:", error));

  loadPromise?.catch((error) => {
    console.error("Renderer load promise rejected", error);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    telnetBridgeReady = false;
  });

  mainWindow.on("focus", emitWindowState);
  mainWindow.on("blur", emitWindowState);
  mainWindow.on("maximize", emitWindowState);
  mainWindow.on("unmaximize", emitWindowState);
  mainWindow.on("minimize", emitWindowState);
  mainWindow.on("restore", emitWindowState);
  mainWindow.on("enter-full-screen", emitWindowState);
  mainWindow.on("leave-full-screen", emitWindowState);

  mainWindow.webContents.on("did-finish-load", () => {
    dispatchTelnetRequests();
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
  app.on("second-instance", (_event, commandLine) => {
    for (const arg of commandLine) {
      if (typeof arg === "string" && arg.startsWith("telnet://")) {
        ingestTelnetUrl(arg);
      }
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    ingestTelnetUrl(url);
  });

  app.whenReady().then(() => {
    const registered = process.defaultApp && process.argv.length >= 2
      ? app.setAsDefaultProtocolClient("telnet", process.execPath, [path.resolve(process.argv[1])])
      : app.setAsDefaultProtocolClient("telnet");

    if (!registered) {
      console.warn("Failed to register telnet protocol handler. External telnet links may open the system default application.");
    }

    for (const arg of process.argv) {
      if (typeof arg === "string" && arg.startsWith("telnet://")) {
        ingestTelnetUrl(arg);
      }
    }

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

  app.on("before-quit", () => {
    for (const id of Array.from(terminalSessions.keys())) {
      disposeTerminalSession(id);
    }
  });
}

ipcMain.handle("terminal:create", (event, rawOptions: TerminalLaunchOptions = {}) => {
  const sender = event.sender;
  const id = randomUUID();
  const dimensions = rawOptions.dimensions ?? {};
  const cols = sanitizeDimension(dimensions.cols, 80, 2, 500);
  const rows = sanitizeDimension(dimensions.rows, 24, 1, 200);

  try {
    const pty = spawn(getDefaultShell(), getDefaultShellArgs(), {
      name: "xterm-color",
      cols,
      rows,
      cwd: process.cwd(),
      env: process.env,
    });

    terminalSessions.set(id, { pty, sender });

    const safeSend = (channel: string, payload: Record<string, unknown>) => {
      if (!sender.isDestroyed()) {
        sender.send(channel, payload);
      }
    };

    pty.onData((data) => {
      safeSend("terminal:data", { id, data });
    });

    pty.onExit((exit) => {
      disposeTerminalSession(id);
      safeSend("terminal:exit", { id, exitCode: exit.exitCode, signal: exit.signal });
    });

    sender.once("destroyed", () => {
      disposeTerminalSession(id);
    });

    if (rawOptions.host) {
      const portFragment = rawOptions.port ? ` ${rawOptions.port}` : "";
      const launchCommand = `telnet ${rawOptions.host}${portFragment}\r`;
      setTimeout(() => {
        try {
          pty.write(launchCommand);
        } catch (error) {
          console.error("Failed to bootstrap telnet session", id, error);
          safeSend("terminal:error", {
            id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }, 250);
    }

    return { id };
  } catch (error) {
    if (!sender.isDestroyed()) {
      sender.send("terminal:error", {
        id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }
});

ipcMain.handle("terminal:dispose", (_event, id: string) => disposeTerminalSession(id));

ipcMain.on(
  "terminal:write",
  (_event, payload: { id: string; data: string }) => {
    const session = terminalSessions.get(payload.id);
    if (!session) {
      return;
    }
    try {
      session.pty.write(payload.data);
    } catch (error) {
      console.error("Failed to write to terminal", payload.id, error);
    }
  }
);

ipcMain.on(
  "terminal:resize",
  (_event, payload: { id: string; dimensions: TerminalDimensions }) => {
    const session = terminalSessions.get(payload.id);
    if (!session) {
      return;
    }
    const cols = sanitizeDimension(payload.dimensions?.cols, session.pty.cols, 2, 500);
    const rows = sanitizeDimension(payload.dimensions?.rows, session.pty.rows, 1, 200);
    try {
      session.pty.resize(cols, rows);
    } catch (error) {
      console.error("Failed to resize terminal", payload.id, error);
    }
  }
);

ipcMain.on("terminal:input-signal", (_event, payload: { id: string; signal: string }) => {
  const session = terminalSessions.get(payload.id);
  if (!session) {
    return;
  }
  try {
    session.pty.kill(payload.signal);
  } catch (error) {
    console.error("Failed to send signal", payload.id, error);
  }
});

ipcMain.handle("app:get-version", () => app.getVersion());
ipcMain.handle("app:ping", () => "pong");

ipcMain.handle("window:get-state", () => {
  if (!mainWindow) {
    return { isMaximized: false, isFullScreen: false, isFocused: false } satisfies WindowStatePayload;
  }
  return {
    isMaximized: mainWindow.isMaximized(),
    isFullScreen: mainWindow.isFullScreen(),
    isFocused: mainWindow.isFocused(),
  } satisfies WindowStatePayload;
});

ipcMain.handle("window:toggle-maximize", () => {
  if (!mainWindow) {
    return { isMaximized: false, isFullScreen: false, isFocused: false } satisfies WindowStatePayload;
  }
  if (mainWindow.isFullScreen()) {
    mainWindow.setFullScreen(false);
  } else if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return {
    isMaximized: mainWindow.isMaximized(),
    isFullScreen: mainWindow.isFullScreen(),
    isFocused: mainWindow.isFocused(),
  } satisfies WindowStatePayload;
});

ipcMain.on("window:minimize", () => {
  if (!mainWindow) {
    return;
  }
  mainWindow.minimize();
  emitWindowState();
});

ipcMain.on("window:close", () => {
  mainWindow?.close();
});

ipcMain.handle("telnet:bridge-ready", () => {
  telnetBridgeReady = true;
  const payload = pendingTelnetRequests.splice(0, pendingTelnetRequests.length);
  return payload;
});
