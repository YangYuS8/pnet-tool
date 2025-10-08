import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { app, BrowserWindow, ipcMain, nativeImage, nativeTheme, protocol, shell } from "electron";
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

function normalizeLabel(label?: string | null) {
  if (typeof label !== "string") {
    return undefined;
  }
  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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
const DEV_SERVER_URL = process.env.ELECTRON_START_URL ?? "http://localhost:3000";
const PRELOAD_PATH = path.join(__dirname, "preload.js");

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

function getWindowState(target?: BrowserWindow | null): WindowStatePayload {
  if (!target || target.isDestroyed()) {
    return { isMaximized: false, isFullScreen: false, isFocused: false } satisfies WindowStatePayload;
  }
  return {
    isMaximized: target.isMaximized(),
    isFullScreen: target.isFullScreen(),
    isFocused: target.isFocused(),
  } satisfies WindowStatePayload;
}

function sendWindowState(target: BrowserWindow) {
  if (target.isDestroyed() || target.webContents.isDestroyed()) {
    return;
  }
  target.webContents.send("window:state", getWindowState(target));
}

type WindowStateEvent =
  | "focus"
  | "blur"
  | "maximize"
  | "unmaximize"
  | "minimize"
  | "restore"
  | "enter-full-screen"
  | "leave-full-screen";

const windowStateEvents: WindowStateEvent[] = [
  "focus",
  "blur",
  "maximize",
  "unmaximize",
  "minimize",
  "restore",
  "enter-full-screen",
  "leave-full-screen",
];

function registerWindowStateEvents(target: BrowserWindow) {
  const emit = () => sendWindowState(target);

  windowStateEvents.forEach((eventName) => {
    const typedEvent = eventName as Parameters<BrowserWindow["on"]>[0];
    target.on(typedEvent, emit);
  });

  target.on("closed", () => {
    windowStateEvents.forEach((eventName) => {
      const typedEvent = eventName as Parameters<BrowserWindow["removeListener"]>[0];
      target.removeListener(typedEvent, emit);
    });
  });

  target.webContents.on("did-finish-load", emit);
  target.once("ready-to-show", emit);
}

type TerminalDimensions = {
  cols?: number;
  rows?: number;
};

type TerminalLaunchOptions = {
  host?: string;
  port?: number;
  label?: string;
  dimensions?: TerminalDimensions;
};

type TerminalSession = {
  pty: IPty;
  sender: Electron.WebContents;
  host?: string;
  port?: number;
  label?: string;
  buffer: string;
  matchKey?: string | null;
  destroyListener?: () => void;
};

const terminalSessions = new Map<string, TerminalSession>();
type TelnetLaunchRequest = {
  host: string;
  port?: number;
  label?: string;
};

type TelnetActivateAction = {
  type: "activate";
  sessionId: string;
  host?: string;
  port?: number;
  label?: string;
};

type TelnetOpenAction = {
  type: "open";
  request: TelnetLaunchRequest;
};

type TelnetAction = TelnetActivateAction | TelnetOpenAction;

type PnetlabHealthCheckPayload = {
  ip?: string;
  port?: number;
};

const pendingTelnetActions: TelnetAction[] = [];
let telnetBridgeReady = false;
const sessionWindows = new Set<BrowserWindow>();
const sessionWindowMap = new Map<string, BrowserWindow>();
const reattachPendingWindows = new Map<string, BrowserWindow>();
const sessionKeyIndex = new Map<string, string>();

const MAX_TERMINAL_BUFFER_CHARS = 120_000;

let cachedAppIcon: Electron.NativeImage | null | undefined;

function resolveIconCandidates() {
  if (app.isPackaged) {
    return [
      path.join(process.resourcesPath, "build/icons/pnet-tool.png"),
      path.join(process.resourcesPath, "build/icons/pnet-tool.svg"),
    ];
  }

  const baseDir = path.join(__dirname, "..");
  return [
    path.join(baseDir, "build/icons/pnet-tool.png"),
    path.join(baseDir, "build/icons/pnet-tool.svg"),
    path.join(process.cwd(), "build/icons/pnet-tool.png"),
    path.join(process.cwd(), "build/icons/pnet-tool.svg"),
  ];
}

function loadNativeImage(candidate: string) {
  try {
    const stats = fs.statSync(candidate, { throwIfNoEntry: false });
    if (!stats?.isFile()) {
      return null;
    }
    if (candidate.endsWith(".svg")) {
      const buffer = fs.readFileSync(candidate);
      const image = nativeImage.createFromBuffer(buffer, { scaleFactor: 1 });
      return image.isEmpty() ? null : image;
    }
    const image = nativeImage.createFromPath(candidate);
    return image.isEmpty() ? null : image;
  } catch (error) {
    console.warn("Failed to load application icon", candidate, error);
    return null;
  }
}

function getAppIcon() {
  if (cachedAppIcon !== undefined) {
    return cachedAppIcon ?? undefined;
  }

  for (const candidate of resolveIconCandidates()) {
    const image = loadNativeImage(candidate);
    if (image) {
      cachedAppIcon = image;
      return cachedAppIcon;
    }
  }

  cachedAppIcon = null;
  return undefined;
}

function normalizePort(port?: number) {
  if (typeof port !== "number" || !Number.isFinite(port) || port <= 0) {
    return undefined;
  }
  return port;
}

function makeSessionKey(host?: string, port?: number) {
  if (!host) {
    return null;
  }
  const normalizedPort = normalizePort(port);
  return `${host}:${normalizedPort ?? ""}`;
}

function appendSessionBuffer(session: TerminalSession, chunk: string) {
  session.buffer = `${session.buffer}${chunk}`.slice(-MAX_TERMINAL_BUFFER_CHARS);
}

function deliverToRenderers(channel: string, payload: Record<string, unknown>) {
  const recipients = new Set<Electron.WebContents>();
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    recipients.add(mainWindow.webContents);
  }
  sessionWindows.forEach((window) => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      recipients.add(window.webContents);
    }
  });
  recipients.forEach((target) => {
    try {
      target.send(channel, payload);
    } catch (error) {
      console.warn(`Failed to deliver ${channel} payload`, error);
    }
  });
}

function detectPromptLabel(buffer: string) {
  const lines = buffer.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const rawLine = lines[index];
    if (!rawLine) {
      continue;
    }
    const line = rawLine.trimEnd();
    if (!line) {
      continue;
    }

    const iosLikeMatch = line.match(/^([A-Za-z0-9][\w.-]{0,63})(?:\(.+\))?[>#]$/);
    if (iosLikeMatch) {
      return iosLikeMatch[1];
    }

    const shellMatch = line.match(/^([A-Za-z0-9._-]{1,64})(?:@[A-Za-z0-9._-]+)?(?::[~\w/.-]+)?\s?[#$]$/);
    if (shellMatch) {
      return shellMatch[1];
    }
  }
  return null;
}

function updateSessionLabel(id: string, session: TerminalSession, candidate?: string | null) {
  const nextLabel = candidate?.trim();
  if (!nextLabel || nextLabel.length === 0) {
    return;
  }
  if (session.label === nextLabel) {
    return;
  }
  session.label = nextLabel;
  deliverToRenderers("terminal:label", {
    id,
    label: nextLabel,
    host: session.host,
    port: session.port,
  });
}

function enqueueTelnetAction(action: TelnetAction) {
  pendingTelnetActions.push(action);
  dispatchTelnetActions();
}

function enqueueTelnetOpen(request: TelnetLaunchRequest) {
  enqueueTelnetAction({ type: "open", request });
}

function enqueueTelnetActivate(action: TelnetActivateAction) {
  enqueueTelnetAction(action);
}

function dispatchTelnetActions() {
  if (!telnetBridgeReady) {
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents || mainWindow.webContents.isDestroyed()) {
    return;
  }
  if (pendingTelnetActions.length === 0) {
    return;
  }
  const payload = pendingTelnetActions.splice(0, pendingTelnetActions.length);
  mainWindow.webContents.send("telnet:requests", payload);
}

function handleIncomingTelnetRequest(request: TelnetLaunchRequest) {
  const normalizedLabel = normalizeLabel(request.label ?? null);
  const key = makeSessionKey(request.host, request.port);

  if (key) {
    const existingId = sessionKeyIndex.get(key);
    if (existingId) {
      const session = terminalSessions.get(existingId);
      if (session) {
        if (normalizedLabel) {
          updateSessionLabel(existingId, session, normalizedLabel);
        }
        const activatePayload: TelnetActivateAction = {
          type: "activate",
          sessionId: existingId,
          host: session.host,
          port: session.port,
          label: normalizeLabel(session.label ?? normalizedLabel ?? null) ?? undefined,
        };
        enqueueTelnetActivate(activatePayload);

        const targetWindow = sessionWindowMap.get(existingId);
        if (targetWindow && !targetWindow.isDestroyed()) {
          if (targetWindow.isMinimized()) {
            targetWindow.restore();
          }
          targetWindow.focus();
        } else if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.focus();
        }
        return;
      }
    }
  }

  enqueueTelnetOpen({
    host: request.host,
    port: request.port,
    label: normalizedLabel ?? undefined,
  });

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
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
    const rawLabel =
      url.searchParams.get("name") ??
      url.searchParams.get("label") ??
      url.searchParams.get("device") ??
      url.username ??
      (url.pathname && url.pathname !== "/"
        ? decodeURIComponent(url.pathname.replace(/^\//, ""))
        : undefined);
    const label = rawLabel?.trim() ? rawLabel.trim() : undefined;
    return {
      host,
      port: normalizedPort,
      label,
    };
  } catch (error) {
    console.warn("Failed to parse telnet url", rawUrl, error);
    return null;
  }
}

function ingestTelnetUrl(rawUrl: string) {
  const request = parseTelnetUrl(rawUrl);
  if (request) {
    handleIncomingTelnetRequest(request);
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
  if (session.destroyListener) {
    try {
      session.sender.removeListener("destroyed", session.destroyListener);
    } catch (error) {
      console.warn("Failed to detach destroy listener", id, error);
    }
  }
  if (session.matchKey) {
    const mappedId = sessionKeyIndex.get(session.matchKey);
    if (mappedId === id) {
      sessionKeyIndex.delete(session.matchKey);
    }
  }

  const attachedWindow = sessionWindowMap.get(id);
  if (attachedWindow && !attachedWindow.isDestroyed()) {
    try {
      attachedWindow.close();
    } catch (error) {
      console.warn("Failed to close session window during dispose", id, error);
    }
  }
  sessionWindowMap.delete(id);
  reattachPendingWindows.delete(id);
  terminalSessions.delete(id);
  return true;
}

function attachSessionToSender(id: string, sender: Electron.WebContents) {
  const session = terminalSessions.get(id);
  if (!session) {
    throw new Error(`Terminal session ${id} not found`);
  }

  if (session.destroyListener) {
    try {
      session.sender.removeListener("destroyed", session.destroyListener);
    } catch (error) {
      console.warn("Failed to remove previous destroy listener", id, error);
    }
  }

  const destroyListener = () => {
    disposeTerminalSession(id);
  };

  sender.on("destroyed", destroyListener);

  session.sender = sender;
  session.destroyListener = destroyListener;

  const owningWindow = BrowserWindow.fromWebContents(sender) ?? null;
  if (!owningWindow || owningWindow === mainWindow) {
    sessionWindowMap.delete(id);
    reattachPendingWindows.delete(id);
  } else if (!owningWindow.isDestroyed()) {
    if (sessionWindowMap.get(id) !== owningWindow) {
      owningWindow.once("closed", () => {
        if (sessionWindowMap.get(id) === owningWindow) {
          sessionWindowMap.delete(id);
        }
        reattachPendingWindows.delete(id);
      });
    }
    sessionWindowMap.set(id, owningWindow);
  }

  return true;
}

function createDetachedSessionWindow(sessionId: string, title?: string) {
  const session = terminalSessions.get(sessionId);
  if (!session) {
    throw new Error(`Unable to detach unknown session ${sessionId}`);
  }

  const windowTitle =
    title ??
    session.label ??
    (session.host ? `Telnet ${session.host}${session.port ? `:${session.port}` : ""}` : "Telnet Session");

  const detachedWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 820,
    minHeight: 520,
    title: windowTitle,
    show: false,
    frame: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0f1115" : "#f5f5f5",
    icon: getAppIcon(),
    webPreferences: {
      preload: PRELOAD_PATH,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  sessionWindows.add(detachedWindow);
  registerWindowStateEvents(detachedWindow);

  detachedWindow.once("ready-to-show", () => {
    if (!detachedWindow.isDestroyed()) {
      detachedWindow.show();
    }
  });

  detachedWindow.on("closed", () => {
    sessionWindows.delete(detachedWindow);
    if (sessionWindowMap.get(sessionId) === detachedWindow) {
      sessionWindowMap.delete(sessionId);
    }
    reattachPendingWindows.delete(sessionId);
  });

  const queryParams = new URLSearchParams({ sessionId });
  if (session.host) {
    queryParams.set("host", session.host);
  }
  if (session.port) {
    queryParams.set("port", String(session.port));
  }
  if (session.label) {
    queryParams.set("label", session.label);
  }

  const targetUrl = isDev
    ? `${DEV_SERVER_URL.replace(/\/$/, "")}/session?${queryParams.toString()}`
    : `app://-/session/index.html?${queryParams.toString()}`;

  detachedWindow
    .loadURL(targetUrl)
    .catch((error) => console.error("Failed to load detached session window", error));

  sessionWindowMap.set(sessionId, detachedWindow);

  return detachedWindow;
}

function createMainWindow() {
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
    icon: getAppIcon(),
    webPreferences: {
      preload: PRELOAD_PATH,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  telnetBridgeReady = false;

  mainWindow.setMenuBarVisibility(false);
  registerWindowStateEvents(mainWindow);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (mainWindow) {
      sendWindowState(mainWindow);
    }
  });

  let loadPromise: Promise<void> | undefined;

  if (isDev) {
    loadPromise = mainWindow
      .loadURL(DEV_SERVER_URL)
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

  mainWindow.webContents.on("did-finish-load", () => {
    dispatchTelnetActions();
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
  const normalizedHost = rawOptions.host?.trim() ?? undefined;
  const normalizedPort = normalizePort(rawOptions.port);
  const normalizedLabel = normalizeLabel(rawOptions.label ?? normalizedHost ?? null);
  const matchKey = makeSessionKey(normalizedHost, normalizedPort);

  try {
    const pty = spawn(getDefaultShell(), getDefaultShellArgs(), {
      name: "xterm-color",
      cols,
      rows,
      cwd: process.cwd(),
      env: process.env,
    });

    const session: TerminalSession = {
      pty,
      sender,
      host: normalizedHost,
      port: normalizedPort,
      label: normalizedLabel ?? undefined,
      buffer: "",
      matchKey,
    };

    terminalSessions.set(id, session);
    attachSessionToSender(id, sender);

    if (matchKey) {
      sessionKeyIndex.set(matchKey, id);
    }

    if (session.label) {
      updateSessionLabel(id, session, session.label);
    }

    const safeSend = (channel: string, payload: Record<string, unknown>) => {
      const currentSession = terminalSessions.get(id);
      if (!currentSession || currentSession.sender.isDestroyed()) {
        return;
      }
      currentSession.sender.send(channel, payload);
    };

    pty.onData((data) => {
      const currentSession = terminalSessions.get(id);
      if (currentSession) {
        appendSessionBuffer(currentSession, data);
        const labelFromBuffer = detectPromptLabel(currentSession.buffer);
        updateSessionLabel(id, currentSession, labelFromBuffer);
      }
      safeSend("terminal:data", { id, data });
    });

    pty.onExit((exit) => {
      disposeTerminalSession(id);
      safeSend("terminal:exit", { id, exitCode: exit.exitCode, signal: exit.signal });
    });

    if (normalizedHost) {
      const portFragment = normalizedPort ? ` ${normalizedPort}` : "";
      const launchCommand = `telnet ${normalizedHost}${portFragment}\r`;
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

ipcMain.handle(
  "terminal:attach",
  (event, payload: { id?: string; dimensions?: TerminalDimensions } = {}) => {
    const id = typeof payload.id === "string" ? payload.id : "";
    if (!id) {
      return false;
    }
    const session = terminalSessions.get(id);
    if (!session) {
      return false;
    }

    attachSessionToSender(id, event.sender);

    if (payload.dimensions) {
      const cols = sanitizeDimension(payload.dimensions.cols, session.pty.cols, 2, 500);
      const rows = sanitizeDimension(payload.dimensions.rows, session.pty.rows, 1, 200);
      try {
        session.pty.resize(cols, rows);
      } catch (error) {
        console.error("Failed to resize terminal during attach", id, error);
      }
    }

    return true;
  }
);

ipcMain.handle("terminal:describe", (_event, payload: { id?: string } = {}) => {
  const id = typeof payload.id === "string" ? payload.id : "";
  if (!id) {
    return null;
  }
  const session = terminalSessions.get(id);
  if (!session) {
    return null;
  }
  return {
    id,
    host: session.host,
    port: session.port,
    label: session.label,
  } satisfies { id: string; host?: string; port?: number; label?: string };
});

ipcMain.handle("terminal:get-buffer", (_event, payload: { id?: string } = {}) => {
  const id = typeof payload.id === "string" ? payload.id : "";
  if (!id) {
    return "";
  }
  const session = terminalSessions.get(id);
  if (!session) {
    return "";
  }
  return session.buffer;
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

ipcMain.handle("window:get-state", (event) => {
  const target = BrowserWindow.fromWebContents(event.sender);
  return getWindowState(target);
});

ipcMain.handle("window:toggle-maximize", (event) => {
  const target = BrowserWindow.fromWebContents(event.sender);
  if (!target) {
    return getWindowState(null);
  }
  if (target.isFullScreen()) {
    target.setFullScreen(false);
  } else if (target.isMaximized()) {
    target.unmaximize();
  } else {
    target.maximize();
  }
  return getWindowState(target);
});

ipcMain.handle("window:open-session", (_event, payload: { sessionId?: string; title?: string } = {}) => {
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
  if (!sessionId) {
    return false;
  }
  if (!terminalSessions.has(sessionId)) {
    return false;
  }
  const existingWindow = sessionWindowMap.get(sessionId);
  if (existingWindow && !existingWindow.isDestroyed()) {
    if (existingWindow.isMinimized()) {
      existingWindow.restore();
    }
    existingWindow.focus();
    return true;
  }
  try {
    createDetachedSessionWindow(sessionId, payload.title);
    return true;
  } catch (error) {
    console.error("Failed to open detached session window", sessionId, error);
    return false;
  }
});

ipcMain.on("window:minimize", (event) => {
  const target = BrowserWindow.fromWebContents(event.sender);
  target?.minimize();
  if (target) {
    sendWindowState(target);
  }
});

ipcMain.on("window:close", (event) => {
  const target = BrowserWindow.fromWebContents(event.sender);
  target?.close();
});

ipcMain.handle("telnet:bridge-ready", () => {
  telnetBridgeReady = true;
  const payload = pendingTelnetActions.splice(0, pendingTelnetActions.length);
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
