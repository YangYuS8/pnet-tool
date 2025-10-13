// Global DesktopBridge types to avoid using `any` in React components

export type TerminalDimensions = {
  cols?: number;
  rows?: number;
};

export type TerminalCreateOptions = {
  host?: string;
  port?: number;
  label?: string;
  dimensions?: TerminalDimensions;
};

export type TerminalCreateResult = { id: string };

export type TerminalAttachOptions = { id: string; dimensions?: TerminalDimensions };

export type TerminalDescribeResult = {
  id: string;
  host?: string;
  port?: number;
  label?: string;
};

export type TerminalDataPayload = { id: string; data: string };
export type TerminalExitPayload = { id: string; exitCode: number | null; signal: number | null };
export type TerminalErrorPayload = { id: string; message: string };
export type TerminalLabelPayload = { id: string; label?: string; host?: string; port?: number };

export type WindowStatePayload = {
  isMaximized: boolean;
  isFullScreen: boolean;
  isFocused: boolean;
};

export type TelnetLaunchRequest = { host: string; port?: number; label?: string };
export type TelnetOpenAction = { type: "open"; request: TelnetLaunchRequest };
export type TelnetActivateAction = { type: "activate"; sessionId: string; host?: string; port?: number; label?: string };
export type TelnetAction = TelnetOpenAction | TelnetActivateAction;

export type PnetlabHealthRequest = { ip: string; port?: number };
export type PnetlabHealthResponse = { ok: boolean; latencyMs?: number; status?: number; statusText?: string; message?: string };

export type TerminalPreferences = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
};

export type RecentConnection = { host: string; port: number; label: string; lastConnectedAt: number };

export type AppSettings = {
  preferredLocale: string;
  terminal: TerminalPreferences;
  recentConnections: RecentConnection[];
};

export type SettingsUpdateResult = { ok: boolean; updated: boolean; locale?: string; error?: string };
export type TerminalSettingsUpdateResult = { ok: boolean; updated: boolean; settings?: TerminalPreferences; error?: string };
export type RecentConnectionsUpdateResult = { ok: boolean; updated: boolean; connections: RecentConnection[]; error?: string };

export interface DesktopBridgeWindowApi {
  minimize: () => void;
  toggleMaximize: () => Promise<WindowStatePayload>;
  close: () => void;
  getState: () => Promise<WindowStatePayload>;
  onStateChange: (callback: (payload: WindowStatePayload) => void) => () => void;
}

export interface DesktopBridgeTerminalApi {
  createTelnetSession: (options: TerminalCreateOptions) => Promise<TerminalCreateResult>;
  write: (id: string, data: string) => void;
  resize: (id: string, dimensions: TerminalDimensions) => void;
  dispose: (id: string) => Promise<boolean>;
  sendSignal: (id: string, signal: string) => void;
  attach: (options: TerminalAttachOptions) => Promise<boolean>;
  describe: (id: string) => Promise<TerminalDescribeResult | null>;
  readBuffer: (id: string) => Promise<string>;
  onData: (callback: (payload: TerminalDataPayload) => void) => () => void;
  onExit: (callback: (payload: TerminalExitPayload) => void) => () => void;
  onError: (callback: (payload: TerminalErrorPayload) => void) => () => void;
  onLabel: (callback: (payload: TerminalLabelPayload) => void) => () => void;
}

export interface DesktopBridge {
  getVersion: () => Promise<string>;
  ping: () => Promise<string>;
  restart: () => Promise<boolean>;
  terminal: DesktopBridgeTerminalApi;
  window?: DesktopBridgeWindowApi;
  telnet?: {
    ready: () => Promise<TelnetAction[]>;
    onRequests: (callback: (payload: TelnetAction[]) => void) => () => void;
  };
  pnetlab?: {
    checkHealth: (payload: PnetlabHealthRequest) => Promise<PnetlabHealthResponse>;
  };
  settings?: {
    get: () => Promise<AppSettings>;
    setPreferredLocale: (locale: string) => Promise<SettingsUpdateResult>;
    setTerminalPreferences: (settings: Partial<TerminalPreferences>) => Promise<TerminalSettingsUpdateResult>;
    addRecentConnection: (connection: { host: string; port?: number; label?: string }) => Promise<RecentConnectionsUpdateResult>;
    clearRecentConnections: () => Promise<RecentConnectionsUpdateResult>;
  };
}

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}

export {};