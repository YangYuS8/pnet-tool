"use client";

import { useEffect } from "react";
import type {
  AppSettings,
  DesktopBridge,
  TerminalDataPayload,
  TerminalExitPayload,
} from "@/types/desktop-bridge";
import type { TelnetAction } from "@/types/desktop-bridge";
// These imports resolve only in Tauri runtime builds; in plain web they are unused.
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { Command, type TerminatedPayload } from "@tauri-apps/plugin-shell";
import type { Child } from "@tauri-apps/plugin-shell";

// Minimal settings storage using localStorage as a placeholder
const SETTINGS_KEY = "pnet-tool:settings";

function getSettings() {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setSettings(obj: unknown) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(obj));
}

export function TauriBridgeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const bridge = {
      getVersion: async () => (await invoke<string>("plugin:app|version")).toString(),
      ping: async () => "pong",
      restart: async () => {
        try {
          await relaunch();
          return true;
        } catch {
          return false;
        }
      },
    terminal: {
  async createTelnetSession({ host, port }: { host: string; port?: number }) {
          // Fallback: spawn telnet as a child process (no PTY), stream lines via stdout
          const isWin = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
          // call telnet directly to match the shell scope whitelist
          const bin = "telnet";
          const args = [host, String(port ?? 23)];
          const cmd = await Command.create(bin, args);
          // Attempt to enable stdin piping if available (plugin-shell simple mode may not support it)
          // Attach listeners before spawn to avoid missing early output
          const toText = (data: string | Uint8Array) => (typeof data === "string" ? data : new TextDecoder().decode(data));
          const id = Math.random().toString(36).slice(2);
          (window as { __pnetProcs?: Map<string, Child> }).__pnetProcs = (window as { __pnetProcs?: Map<string, Child> }).__pnetProcs || new Map<string, Child>();
          cmd.stdout.on("data", (data: string | Uint8Array) => {
            window.dispatchEvent(new CustomEvent<TerminalDataPayload>("terminal:data", { detail: { id, data: toText(data) } }));
          });
          cmd.stderr.on("data", (data: string | Uint8Array) => {
            window.dispatchEvent(new CustomEvent<TerminalDataPayload>("terminal:data", { detail: { id, data: toText(data) } }));
          });
          cmd.on("close", (payload: TerminatedPayload) => {
            const { code, signal } = payload ?? { code: null, signal: null };
            window.dispatchEvent(new CustomEvent<TerminalExitPayload>("terminal:exit", { detail: { id, exitCode: code, signal } }));
            (window as { __pnetProcs?: Map<string, Child> }).__pnetProcs?.delete(id);
          });
          const child = await cmd.spawn();
          (window as { __pnetProcs?: Map<string, Child> }).__pnetProcs!.set(id, child);
          return { id };
        },
        write(id: string, data: string) {
          try {
            const proc = (window as { __pnetProcs?: Map<string, Child> }).__pnetProcs?.get(id);
            if (!proc) return;
            void proc.write(data);
          } catch (e) {
            console.warn("write() not supported in current telnet mode", e);
          }
        },
        resize() {},
        async dispose(id: string) {
          const proc = (window as { __pnetProcs?: Map<string, Child> }).__pnetProcs?.get(id);
          try { await proc?.kill(); } catch {}
          (window as { __pnetProcs?: Map<string, Child> }).__pnetProcs?.delete(id);
          return true;
        },
        sendSignal() {},
        async attach() { return true; },
        async describe(id: string) { return { id }; },
        async readBuffer() { return ""; },
        onData(callback: (payload: TerminalDataPayload) => void) {
          const handler = (ev: Event) => callback((ev as CustomEvent<TerminalDataPayload>).detail);
          window.addEventListener("terminal:data", handler as EventListener);
          return () => window.removeEventListener("terminal:data", handler as EventListener);
        },
        onExit(callback: (payload: TerminalExitPayload) => void) {
          const handler = (ev: Event) => callback((ev as CustomEvent<TerminalExitPayload>).detail);
          window.addEventListener("terminal:exit", handler as EventListener);
          return () => window.removeEventListener("terminal:exit", handler as EventListener);
        },
        onError() { return () => {}; },
        onLabel() { return () => {}; },
      },
      pnetlab: {
        async checkHealth({ ip, port }: { ip: string; port?: number }) {
          try {
            const response = await fetch(`http://${ip}:${port ?? 80}/`, { method: "HEAD" });
            return { ok: response.ok || response.status < 500, status: response.status, statusText: response.statusText };
          } catch (e: unknown) {
            return { ok: false, message: e instanceof Error ? e.message : "error" };
          }
        }
      },
      settings: {
        async get() {
          return (
            (getSettings() as AppSettings | null) ?? {
              preferredLocale: "zh-CN",
              terminal: { fontFamily: "", fontSize: 14, lineHeight: 1.25, letterSpacing: 0 },
              recentConnections: [],
            }
          );
        },
        async setPreferredLocale(locale: string) {
          // self-get to avoid external any
          const s = (await (window.desktopBridge?.settings?.get?.())) ?? (await this.get());
          s.preferredLocale = locale;
          setSettings(s);
          return { ok: true, updated: true, locale };
        },
        async setTerminalPreferences(settings: Partial<{ fontFamily: string; fontSize: number; lineHeight: number; letterSpacing: number }>) {
          const s = (await (window.desktopBridge?.settings?.get?.())) ?? (await this.get());
          s.terminal = { ...s.terminal, ...settings };
          setSettings(s);
          return { ok: true, updated: true, settings: s.terminal };
        },
        async addRecentConnection(connection: { host: string; port?: number; label?: string }) {
          const s = (await (window.desktopBridge?.settings?.get?.())) ?? (await this.get());
          const now = Date.now();
          const entry = { host: connection.host, port: connection.port ?? 23, label: connection.label ?? connection.host, lastConnectedAt: now };
          s.recentConnections = [entry, ...s.recentConnections.filter((x: { host: string; port: number }) => x.host !== entry.host || x.port !== entry.port)].slice(0, 20);
          setSettings(s);
          return { ok: true, updated: true, connections: s.recentConnections };
        },
        async clearRecentConnections() {
          const s = (await (window.desktopBridge?.settings?.get?.())) ?? (await this.get());
          s.recentConnections = [];
          setSettings(s);
          return { ok: true, updated: true, connections: [] };
        }
      }
      ,
      telnet: {
        async ready() {
          try {
            const actions = await invoke<TelnetAction[]>("consume_pending_telnet_actions");
            return Array.isArray(actions) ? actions : [];
          } catch {
            return [];
          }
        },
        onRequests(callback: (payload: TelnetAction[]) => void) {
          const handler = (ev: Event) => {
            const arr = (ev as CustomEvent<TelnetAction[]>).detail;
            if (Array.isArray(arr) && arr.length > 0) {
              callback(arr);
            }
          };
          window.addEventListener("telnet://requests", handler as EventListener);
          return () => window.removeEventListener("telnet://requests", handler as EventListener);
        }
      }
    } as unknown as DesktopBridge;

    (window as unknown as { desktopBridge?: DesktopBridge }).desktopBridge = bridge;
  }, []);

  return <>{children}</>;
}
