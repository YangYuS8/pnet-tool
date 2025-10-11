import { contextBridge, ipcRenderer } from "electron";

type TerminalDimensions = {
  cols?: number;
  rows?: number;
};

type TerminalCreateOptions = {
  host?: string;
  port?: number;
  label?: string;
  dimensions?: TerminalDimensions;
};

type TerminalCreateResult = {
  id: string;
};

type TerminalAttachOptions = {
  id: string;
  dimensions?: TerminalDimensions;
};

type TerminalDescribeResult = {
  id: string;
  host?: string;
  port?: number;
  label?: string;
};

type TerminalDataPayload = {
  id: string;
  data: string;
};

type TerminalExitPayload = {
  id: string;
  exitCode: number | null;
  signal: number | null;
};

type TerminalErrorPayload = {
  id: string;
  message: string;
};

type TerminalLabelPayload = {
  id: string;
  label?: string;
  host?: string;
  port?: number;
};

type WindowStatePayload = {
  isMaximized: boolean;
  isFullScreen: boolean;
  isFocused: boolean;
};

type TelnetLaunchRequest = {
  host: string;
  port?: number;
  label?: string;
};

type TelnetOpenAction = {
  type: "open";
  request: TelnetLaunchRequest;
};

type TelnetActivateAction = {
  type: "activate";
  sessionId: string;
  host?: string;
  port?: number;
  label?: string;
};

type TelnetAction = TelnetOpenAction | TelnetActivateAction;

type PnetlabHealthRequest = {
  ip: string;
  port?: number;
};

type PnetlabHealthResponse = {
  ok: boolean;
  latencyMs?: number;
  status?: number;
  statusText?: string;
  message?: string;
};

type AppSettings = {
  preferredLocale: string;
};

type SettingsUpdateResult = {
  ok: boolean;
  updated: boolean;
  locale?: string;
  error?: string;
};

declare global {
  interface Window {
    desktopBridge: {
      getVersion: () => Promise<string>;
      ping: () => Promise<string>;
      restart: () => Promise<boolean>;
      terminal: {
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
      };
      window?: {
        minimize: () => void;
        toggleMaximize: () => Promise<WindowStatePayload>;
        close: () => void;
        getState: () => Promise<WindowStatePayload>;
        onStateChange: (callback: (payload: WindowStatePayload) => void) => () => void;
      };
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
      };
    };
  }
}

contextBridge.exposeInMainWorld("desktopBridge", {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  ping: () => ipcRenderer.invoke("app:ping"),
  restart: () => ipcRenderer.invoke("app:restart") as Promise<boolean>,
  terminal: {
    createTelnetSession: (options: TerminalCreateOptions) =>
      ipcRenderer.invoke("terminal:create", options) as Promise<TerminalCreateResult>,
    write: (id: string, data: string) => {
      ipcRenderer.send("terminal:write", { id, data });
    },
    resize: (id: string, dimensions: TerminalDimensions) => {
      ipcRenderer.send("terminal:resize", { id, dimensions });
    },
    dispose: (id: string) => ipcRenderer.invoke("terminal:dispose", id) as Promise<boolean>,
    sendSignal: (id: string, signal: string) => {
      ipcRenderer.send("terminal:input-signal", { id, signal });
    },
    attach: (options: TerminalAttachOptions) =>
      ipcRenderer.invoke("terminal:attach", options) as Promise<boolean>,
    describe: (id: string) =>
      ipcRenderer.invoke("terminal:describe", { id }) as Promise<TerminalDescribeResult | null>,
    readBuffer: (id: string) =>
      ipcRenderer.invoke("terminal:get-buffer", { id }) as Promise<string>,
    onData: (callback: (payload: TerminalDataPayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: TerminalDataPayload) => {
        callback(payload);
      };
      ipcRenderer.on("terminal:data", listener);
      return () => {
        ipcRenderer.removeListener("terminal:data", listener);
      };
    },
    onExit: (callback: (payload: TerminalExitPayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: TerminalExitPayload) => {
        callback(payload);
      };
      ipcRenderer.on("terminal:exit", listener);
      return () => {
        ipcRenderer.removeListener("terminal:exit", listener);
      };
    },
    onError: (callback: (payload: TerminalErrorPayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: TerminalErrorPayload) => {
        callback(payload);
      };
      ipcRenderer.on("terminal:error", listener);
      return () => {
        ipcRenderer.removeListener("terminal:error", listener);
      };
    },
    onLabel: (callback: (payload: TerminalLabelPayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: TerminalLabelPayload) => {
        callback(payload);
      };
      ipcRenderer.on("terminal:label", listener);
      return () => {
        ipcRenderer.removeListener("terminal:label", listener);
      };
    },
  },
  window: {
    minimize: () => {
      ipcRenderer.send("window:minimize");
    },
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize") as Promise<WindowStatePayload>,
    close: () => {
      ipcRenderer.send("window:close");
    },
    getState: () => ipcRenderer.invoke("window:get-state") as Promise<WindowStatePayload>,
    onStateChange: (callback: (payload: WindowStatePayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: WindowStatePayload) => {
        callback(payload);
      };
      ipcRenderer.on("window:state", listener);
      return () => {
        ipcRenderer.removeListener("window:state", listener);
      };
    },
  },
  telnet: {
    ready: () => ipcRenderer.invoke("telnet:bridge-ready") as Promise<TelnetAction[]>,
    onRequests: (callback: (payload: TelnetAction[]) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: TelnetAction[]) => {
        callback(payload);
      };
      ipcRenderer.on("telnet:requests", listener);
      return () => {
        ipcRenderer.removeListener("telnet:requests", listener);
      };
    },
  },
  pnetlab: {
    checkHealth: (payload: PnetlabHealthRequest) =>
      ipcRenderer.invoke("pnetlab:health-check", payload) as Promise<PnetlabHealthResponse>,
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get") as Promise<AppSettings>,
    setPreferredLocale: (locale: string) =>
      ipcRenderer.invoke("settings:set-preferred-locale", { locale }) as Promise<SettingsUpdateResult>,
  },
});
