import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { app, BrowserWindow, ipcMain, nativeImage, nativeTheme, protocol, shell } from "electron";
import type { IPty } from "node-pty";
import { spawn } from "node-pty";

const PNETLAB_HOST_PATTERN = /^[a-zA-Z0-9.-]+$/;
const DEFAULT_PNETLAB_PORT = 80;
const DEFAULT_PNETLAB_TIMEOUT = 4000;
const DEFAULT_TELNET_PORT = 23;
const APP_ID = "net.yangyus8.pnettool";
const SUPPORTED_LOCALES = ["zh-CN", "en"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
const DEFAULT_LOCALE: SupportedLocale = "zh-CN";

type TerminalPreferences = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
};

const TERMINAL_FONT_KEYS = new Set([
  "geist-mono",
  "system-mono",
  "jetbrains-mono",
  "fira-code",
  "cascadia-code",
  "consolas",
]);

const DEFAULT_TERMINAL_PREFERENCES: TerminalPreferences = {
  fontFamily: "geist-mono",
  fontSize: 13,
  lineHeight: 1.2,
  letterSpacing: 0,
};

type RecentConnectionRecord = {
  host: string;
  port: number;
  label: string;
  lastConnectedAt: number;
};

const RECENT_CONNECTION_LIMIT = 20;

type AppSettings = {
  preferredLocale: SupportedLocale;
  terminal: TerminalPreferences;
  recentConnections: RecentConnectionRecord[];
};

const DEFAULT_SETTINGS: AppSettings = {
  preferredLocale: DEFAULT_LOCALE,
  terminal: { ...DEFAULT_TERMINAL_PREFERENCES },
  recentConnections: [],
};

let cachedSettings: AppSettings | null = null;

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function normalizeLocaleCandidate(value: unknown): SupportedLocale | null {
  if (typeof value !== "string") {
    return null;
  }
  return SUPPORTED_LOCALES.includes(value as SupportedLocale) ? (value as SupportedLocale) : null;
}

function clampNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(Math.max(numeric, minimum), maximum);
}

function sanitizePortCandidate(value: unknown, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const rounded = Math.round(numeric);
  if (rounded <= 0 || rounded > 65535) {
    return fallback;
  }
  return rounded;
}

function makeRecentConnectionKey(host: string, port: number) {
  return `${host.toLowerCase()}::${port}`;
}

function sanitizeRecentConnectionCandidate(
  candidate: Partial<RecentConnectionRecord> | null | undefined,
  fallback?: RecentConnectionRecord
): RecentConnectionRecord | null {
  const fallbackHost = typeof fallback?.host === "string" ? fallback.host : "";
  const rawHost = typeof candidate?.host === "string" ? candidate.host : fallbackHost;
  const host = rawHost.trim();
  if (!host) {
    return null;
  }

  const fallbackPort = typeof fallback?.port === "number" ? fallback.port : DEFAULT_TELNET_PORT;
  const port = sanitizePortCandidate(candidate?.port, fallbackPort);

  const rawLabel = typeof candidate?.label === "string" ? candidate.label : fallback?.label ?? host;
  const label = rawLabel.trim() || host;

  const timestampCandidate = candidate?.lastConnectedAt;
  const fallbackTimestamp = fallback?.lastConnectedAt ?? Date.now();
  const lastConnectedAt =
    typeof timestampCandidate === "number" && Number.isFinite(timestampCandidate)
      ? timestampCandidate
      : fallbackTimestamp;

  return {
    host,
    port,
    label,
    lastConnectedAt,
  } satisfies RecentConnectionRecord;
}

function sanitizeRecentConnections(
  input: Array<Partial<RecentConnectionRecord>> | null | undefined,
  fallback: RecentConnectionRecord[] = []
): RecentConnectionRecord[] {
  const source = Array.isArray(input) ? input : fallback;
  const result = new Map<string, RecentConnectionRecord>();

  for (const candidate of source) {
    const sanitized = sanitizeRecentConnectionCandidate(candidate);
    if (!sanitized) {
      continue;
    }
    const key = makeRecentConnectionKey(sanitized.host, sanitized.port);
    const existing = result.get(key);
    if (!existing || existing.lastConnectedAt < sanitized.lastConnectedAt) {
      result.set(key, sanitized);
    }
  }

  const merged = Array.from(result.values());
  merged.sort((a, b) => b.lastConnectedAt - a.lastConnectedAt);
  return merged.slice(0, RECENT_CONNECTION_LIMIT);
}

function sanitizeTerminalPreferences(
  input: Partial<TerminalPreferences> | null | undefined,
  fallback: TerminalPreferences = DEFAULT_TERMINAL_PREFERENCES
): TerminalPreferences {
  const base = fallback ?? DEFAULT_TERMINAL_PREFERENCES;
  const rawFontFamily = typeof input?.fontFamily === "string" ? input.fontFamily : base.fontFamily;
  const fontFamily = TERMINAL_FONT_KEYS.has(rawFontFamily) ? rawFontFamily : DEFAULT_TERMINAL_PREFERENCES.fontFamily;
  const fontSize = clampNumber(input?.fontSize, base.fontSize, 10, 26);
  const lineHeight = clampNumber(input?.lineHeight, base.lineHeight, 1, 2);
  const letterSpacing = clampNumber(input?.letterSpacing, base.letterSpacing, -1, 2);

  return {
    fontFamily,
    fontSize,
    lineHeight,
    letterSpacing,
  } satisfies TerminalPreferences;
}

function readSettings(): AppSettings {
  if (cachedSettings) {
    return cachedSettings;
  }

  const fallback: AppSettings = {
    preferredLocale: DEFAULT_SETTINGS.preferredLocale,
    terminal: { ...DEFAULT_TERMINAL_PREFERENCES },
    recentConnections: [],
  };

  try {
    const filePath = getSettingsPath();
    const stats = fs.statSync(filePath, { throwIfNoEntry: false });
    if (!stats?.isFile()) {
      cachedSettings = fallback;
      return cachedSettings;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const preferredLocale = normalizeLocaleCandidate(parsed.preferredLocale) ?? fallback.preferredLocale;
    const terminal = sanitizeTerminalPreferences((parsed as Partial<AppSettings> & { terminal?: Partial<TerminalPreferences> }).terminal, fallback.terminal);
    const recentConnections = sanitizeRecentConnections(
      (parsed as Partial<AppSettings> & { recentConnections?: Array<Partial<RecentConnectionRecord>> }).recentConnections,
      fallback.recentConnections
    );
    cachedSettings = {
      preferredLocale,
      terminal,
      recentConnections,
    } satisfies AppSettings;
    return cachedSettings;
  } catch (error) {
    console.warn("Failed to read settings file", error);
    cachedSettings = fallback;
    return cachedSettings;
  }
}

type SettingsUpdatePayload = {
  preferredLocale?: SupportedLocale;
  terminal?: Partial<TerminalPreferences>;
  recentConnections?: Array<Partial<RecentConnectionRecord>>;
};

function writeSettings(update: SettingsUpdatePayload) {
  const current = readSettings();
  const next: AppSettings = {
    preferredLocale: normalizeLocaleCandidate(update.preferredLocale) ?? current.preferredLocale,
    terminal: sanitizeTerminalPreferences(update.terminal ? { ...current.terminal, ...update.terminal } : current.terminal, current.terminal),
    recentConnections: sanitizeRecentConnections(update.recentConnections ?? current.recentConnections, current.recentConnections),
  };

  try {
    const settingsPath = getSettingsPath();
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2), "utf-8");
    cachedSettings = next;
  } catch (error) {
    console.error("Failed to persist settings", error);
    cachedSettings = next;
  }

  return cachedSettings;
}

function updatePreferredLocale(locale: SupportedLocale) {
  return writeSettings({ preferredLocale: locale });
}

function updateTerminalPreferences(settings: TerminalPreferences) {
  return writeSettings({ terminal: settings });
}

function terminalPreferencesEqual(a: TerminalPreferences, b: TerminalPreferences) {
  return (
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    a.lineHeight === b.lineHeight &&
    a.letterSpacing === b.letterSpacing
  );
}

function appendRecentConnectionRecord(entry: RecentConnectionRecord) {
  const current = readSettings();
  const merged = sanitizeRecentConnections([entry, ...current.recentConnections], current.recentConnections);
  const unchanged =
    merged.length === current.recentConnections.length &&
    merged.every((item, index) => {
      const existing = current.recentConnections[index];
      return (
        existing &&
        existing.host === item.host &&
        existing.port === item.port &&
        existing.label === item.label &&
        existing.lastConnectedAt === item.lastConnectedAt
      );
    });

  if (unchanged) {
    return { settings: current, updated: false } as const;
  }

  const settings = writeSettings({ recentConnections: merged });
  return { settings, updated: true } as const;
}

function clearRecentConnectionsRecord() {
  const current = readSettings();
  if (current.recentConnections.length === 0) {
    return { settings: current, updated: false } as const;
  }
  const settings = writeSettings({ recentConnections: [] });
  return { settings, updated: true } as const;
}

const isDev = !app.isPackaged || process.env.NODE_ENV === "development";
const DEV_SERVER_URL = process.env.ELECTRON_START_URL ?? "http://localhost:3000";
const PRELOAD_PATH = path.join(__dirname, "preload.js");

if (process.platform === "win32") {
  app.setAppUserModelId(APP_ID);
}

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

async function probePnetlabHealth(ip: string, port: number, timeoutMs = DEFAULT_PNETLAB_TIMEOUT) {
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
      } satisfies PnetlabHealthProbeResult;
    }

    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      latencyMs,
    } satisfies PnetlabHealthProbeResult;
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "PNETLab 无法连接",
    } satisfies PnetlabHealthProbeResult;
  } finally {
    clearTimeout(timeoutId);
  }
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
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      recipients.add(window.webContents);
    }
  });
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    recipients.add(mainWindow.webContents);
  }

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
  const normalizedPort = normalizePort(request.port) ?? DEFAULT_TELNET_PORT;
  const key = makeSessionKey(request.host, normalizedPort);

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

        if (mainWindow && !mainWindow.isDestroyed()) {
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
    port: normalizedPort,
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

  return true;
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
  const startUrl = isDev ? DEV_SERVER_URL : "app://-/index.html";

  if (isDev) {
    loadPromise = mainWindow
      .loadURL(startUrl)
      .catch((error) => console.error("Failed to load renderer:", error));
  } else {
    loadPromise = mainWindow
      .loadURL(startUrl)
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
ipcMain.handle("app:restart", () => {
  app.relaunch();
  app.exit(0);
  return true;
});

ipcMain.handle("settings:get", () => readSettings());

ipcMain.handle(
  "settings:set-preferred-locale",
  (_event, payload: { locale?: string } | string) => {
    const candidate = typeof payload === "string" ? payload : payload?.locale;
    const normalized = normalizeLocaleCandidate(candidate);
    if (!normalized) {
      return { ok: false, error: "unsupported-locale" } as const;
    }

    const current = readSettings();
    if (current.preferredLocale === normalized) {
      return {
        ok: true,
        updated: false,
        locale: current.preferredLocale,
      } as const;
    }

    const next = updatePreferredLocale(normalized);
    return {
      ok: true,
      updated: true,
      locale: next.preferredLocale,
    } as const;
  }
);

ipcMain.handle("settings:set-terminal", (_event, payload: Partial<TerminalPreferences> = {}) => {
  if (!payload || typeof payload !== "object") {
    return { ok: false, updated: false, error: "invalid-payload" } as const;
  }

  const current = readSettings();
  const merged = sanitizeTerminalPreferences({ ...current.terminal, ...payload }, current.terminal);
  if (terminalPreferencesEqual(merged, current.terminal)) {
    return { ok: true, updated: false, settings: current.terminal } as const;
  }

  const next = updateTerminalPreferences(merged);
  return {
    ok: true,
    updated: true,
    settings: next.terminal,
  } as const;
});

ipcMain.handle(
  "settings:add-recent-connection",
  (_event, payload: { host?: string; port?: number; label?: string } | null | undefined) => {
    const rawHost = typeof payload?.host === "string" ? payload.host.trim() : "";
    if (!rawHost) {
      return { ok: false, updated: false, error: "invalid-host" } as const;
    }

  const port = sanitizePortCandidate(payload?.port, DEFAULT_TELNET_PORT);
    const rawLabel = typeof payload?.label === "string" ? payload.label : undefined;
    const entry: RecentConnectionRecord = {
      host: rawHost,
      port,
      label: rawLabel?.trim().length ? rawLabel.trim() : rawHost,
      lastConnectedAt: Date.now(),
    };

    const result = appendRecentConnectionRecord(entry);
    return {
      ok: true,
      updated: result.updated,
      connections: result.settings.recentConnections,
    } as const;
  }
);

ipcMain.handle("settings:clear-recent-connections", () => {
  const result = clearRecentConnectionsRecord();
  return {
    ok: true,
    updated: result.updated,
    connections: result.settings.recentConnections,
  } as const;
});

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
