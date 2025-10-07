import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { app, BrowserWindow, ipcMain, nativeTheme, protocol, shell } from "electron";
import type { IPty } from "node-pty";
import { spawn } from "node-pty";

const PNETLAB_HOST_PATTERN = /^[a-zA-Z0-9.-]+$/;
const DEFAULT_PNETLAB_PORT = 80;
const DEFAULT_PNETLAB_TIMEOUT = 4000;

type PnetlabHealthProbeResult =
  | {
      ok: true;
      status: number;
      statusText: string;
      latencyMs: number;
    }
  | {
      ok: false;
      message: string;
      status?: number;
      statusText?: string;
    };

function sanitizePnetlabHost(host: string): boolean {
  return PNETLAB_HOST_PATTERN.test(host);
}

async function probePnetlabHealth(
  ip: string,
  port: number,
  timeoutMs: number = DEFAULT_PNETLAB_TIMEOUT
): Promise<PnetlabHealthProbeResult> {
  const targetUrl = `http://${ip}:${port}/`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(targetUrl, {
      method: "HEAD",
      signal: controller.signal,
    });

    const latencyMs = Date.now() - startedAt;
    const reachable = response.ok || response.status < 500;

    if (!reachable) {
      return {
        ok: false,
        message: response.statusText || "PNETLab 无法连接",
        status: response.status,
        statusText: response.statusText,
      };
    }

    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      latencyMs,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "PNETLab 无法连接",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

const isDev = !app.isPackaged || process.env.NODE_ENV === "development";

if (!isDev) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "app",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
}

function resolveTelnetProtocolTarget() {
  if (process.platform === "linux" && process.env.APPIMAGE) {
    return {
      executable: process.env.APPIMAGE,
      parameters: ["--"] as string[],
    } satisfies { executable: string; parameters: string[] };
  }

  if (process.defaultApp && process.argv.length >= 2) {
    return {
      executable: process.execPath,
      parameters: [path.resolve(process.argv[1])] as string[],
    } satisfies { executable: string; parameters: string[] };
  }

  return {
    executable: process.execPath,
    parameters: [] as string[],
  } satisfies { executable: string; parameters: string[] };
}

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

type PnetlabHealthCheckPayload = {
  ip?: string;
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

  let loadPromise: Promise<void> | undefined;

  if (isDev) {
    loadPromise = mainWindow
      .loadURL(devServerURL)
      .catch((error) => console.error("Failed to load renderer:", error));
  } else {
    loadPromise = mainWindow
      .loadURL("app://-/index.html")
      .catch((error) => console.error("Failed to load renderer:", error));
  }

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
    if (!isDev) {
      const rendererRoot = path.join(__dirname, "renderer");
      const safeRoot = path.normalize(rendererRoot);

      protocol.registerFileProtocol("app", (request, callback) => {
        try {
          const url = new URL(request.url);
          let pathname = decodeURIComponent(url.pathname);
          if (!pathname || pathname === "/") {
            pathname = "/index.html";
          }

          if (pathname.endsWith("/")) {
            pathname = `${pathname}index.html`;
          }

          const resolvedPath = path.normalize(path.join(safeRoot, pathname));
          if (!resolvedPath.startsWith(safeRoot)) {
            callback({ error: -10 });
            return;
          }

          let finalPath: string | null = resolvedPath;
          const stats = fs.statSync(resolvedPath, { throwIfNoEntry: false });
          if (stats?.isDirectory()) {
            const indexCandidate = path.join(resolvedPath, "index.html");
            const indexStats = fs.statSync(indexCandidate, { throwIfNoEntry: false });
            finalPath = indexStats?.isFile() ? indexCandidate : null;
          } else if (!stats?.isFile()) {
            finalPath = null;
          }

          if (!finalPath) {
            callback({ error: -6 });
            return;
          }

          callback({ path: finalPath });
        } catch (error) {
          console.error("Failed to resolve app:// request", request.url, error);
          callback({ error: -6 });
        }
      });
    }

    const telnetTarget = resolveTelnetProtocolTarget();

    const registered = app.setAsDefaultProtocolClient(
      "telnet",
      telnetTarget.executable,
      telnetTarget.parameters
    );

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

ipcMain.handle("pnetlab:health-check", async (_event, payload: PnetlabHealthCheckPayload = {}) => {
  const ip = typeof payload.ip === "string" ? payload.ip.trim() : "";

  if (!ip || !sanitizePnetlabHost(ip)) {
    return { ok: false, message: "请提供有效的 PNETLab IP 地址" };
  }

  const portCandidate = payload.port;
  const portNumber = Number.isInteger(portCandidate) ? Number(portCandidate) : DEFAULT_PNETLAB_PORT;

  if (portNumber <= 0 || portNumber > 65535) {
    return { ok: false, message: "端口号必须在 1-65535 之间" };
  }

  const result = await probePnetlabHealth(ip, portNumber, DEFAULT_PNETLAB_TIMEOUT);

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      status: result.status,
      statusText: result.statusText,
    };
  }

  return {
    ok: true,
    latencyMs: result.latencyMs,
    status: result.status,
    statusText: result.statusText,
  };
});
