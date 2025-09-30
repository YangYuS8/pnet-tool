import { contextBridge, ipcRenderer } from "electron";

type TerminalDimensions = {
  cols?: number;
  rows?: number;
};

type TerminalCreateOptions = {
  host?: string;
  port?: number;
  dimensions?: TerminalDimensions;
};

type TerminalCreateResult = {
  id: string;
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

declare global {
  interface Window {
    desktopBridge: {
      getVersion: () => Promise<string>;
      ping: () => Promise<string>;
      terminal: {
        createTelnetSession: (options: TerminalCreateOptions) => Promise<TerminalCreateResult>;
        write: (id: string, data: string) => void;
        resize: (id: string, dimensions: TerminalDimensions) => void;
        dispose: (id: string) => Promise<boolean>;
        sendSignal: (id: string, signal: string) => void;
        onData: (callback: (payload: TerminalDataPayload) => void) => () => void;
        onExit: (callback: (payload: TerminalExitPayload) => void) => () => void;
        onError: (callback: (payload: TerminalErrorPayload) => void) => () => void;
      };
    };
  }
}

contextBridge.exposeInMainWorld("desktopBridge", {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  ping: () => ipcRenderer.invoke("app:ping"),
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
  },
});
