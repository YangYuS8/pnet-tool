import { contextBridge, ipcRenderer } from "electron";

declare global {
  interface Window {
    desktopBridge: {
      getVersion: () => Promise<string>;
      ping: () => Promise<string>;
    };
  }
}

contextBridge.exposeInMainWorld("desktopBridge", {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  ping: () => ipcRenderer.invoke("app:ping"),
});
