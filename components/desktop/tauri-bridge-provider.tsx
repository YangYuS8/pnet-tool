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
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
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
        // 优先使用 PTY（内置终端），失败时回退到 plugin-shell
        try {
          const id = await invoke<string>("start_pty", { host, port: port ?? 23, cols: 80, rows: 24 });
          return { id };
        } catch (e) {
          console.warn("start_pty failed, fallback to plugin-shell:", e);
          const bin = "telnet";
          const args = [host, String(port ?? 23)];
          const cmd = await Command.create(bin, args);
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
        }
      },
      async write(id: string, data: string) {
        try {
          await invoke("write_pty", { id, data });
        } catch {
          // fallback: plugin-shell
          try {
            const proc = (window as { __pnetProcs?: Map<string, Child> }).__pnetProcs?.get(id);
            await proc?.write(data);
          } catch {}
        }
      },
      async resize(id: string, cols: number, rows: number) {
        try { await invoke("resize_pty", { id, cols, rows }); } catch {}
      },
      async dispose(id: string) {
        try { await invoke("kill_pty", { id }); } catch {}
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
        // PTY 数据事件
        const ptyHandler = (ev: Event) => {
          const { id, data } = (ev as CustomEvent<{ id: string; data: string }>).detail;
          window.dispatchEvent(new CustomEvent<TerminalDataPayload>("terminal:data", { detail: { id, data } }));
        };
        window.addEventListener("pty://data", ptyHandler as EventListener);
        return () => {
          window.removeEventListener("terminal:data", handler as EventListener);
          window.removeEventListener("pty://data", ptyHandler as EventListener);
        };
      },
      onExit(callback: (payload: TerminalExitPayload) => void) {
        const handler = (ev: Event) => callback((ev as CustomEvent<TerminalExitPayload>).detail);
        window.addEventListener("terminal:exit", handler as EventListener);
        const ptyExitHandler = (ev: Event) => {
          const { id } = (ev as CustomEvent<{ id: string }>).detail;
          window.dispatchEvent(new CustomEvent<TerminalExitPayload>("terminal:exit", { detail: { id, exitCode: null, signal: null } }));
        };
        window.addEventListener("pty://exit", ptyExitHandler as EventListener);
        return () => {
          window.removeEventListener("terminal:exit", handler as EventListener);
          window.removeEventListener("pty://exit", ptyExitHandler as EventListener);
        };
      },
      onError() { return () => {}; },
      onLabel(callback?: (payload: { id: string; label?: string; host?: string; port?: number }) => void) {
        if (typeof window === "undefined") return () => {};
        const handler = (ev: Event) => {
          const detail = (ev as CustomEvent<{ id: string; label?: string; host?: string; port?: number }>).detail;
          if (callback && detail) callback(detail);
        };
        window.addEventListener("terminal:label", handler as EventListener);
        return () => window.removeEventListener("terminal:label", handler as EventListener);
      },
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

    // Bridge Tauri events from Rust PTY to our unified terminal events
    let unlistenData: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;
    let unlistenTelnet: UnlistenFn | null = null;
    void listen<{ id: string; data: string }>("pty://data", ({ payload }) => {
      window.dispatchEvent(
        new CustomEvent<TerminalDataPayload>("terminal:data", { detail: { id: payload.id, data: payload.data } })
      );
    }).then((fn) => (unlistenData = fn));
    void listen<{ id: string }>("pty://exit", ({ payload }) => {
      window.dispatchEvent(
        new CustomEvent<TerminalExitPayload>("terminal:exit", { detail: { id: payload.id, exitCode: null, signal: null } })
      );
    }).then((fn) => (unlistenExit = fn));

    // Bridge deep link telnet requests from Rust to window event for HomePage
    void listen<import("@/types/desktop-bridge").TelnetAction[]>("telnet://requests", ({ payload }) => {
      window.dispatchEvent(new CustomEvent<import("@/types/desktop-bridge").TelnetAction[]>("telnet://requests", { detail: payload }));
    }).then((fn) => (unlistenTelnet = fn));

    return () => {
      try { unlistenData?.(); } catch {}
      try { unlistenExit?.(); } catch {}
      try { unlistenTelnet?.(); } catch {}
    };
  }, []);

  return <>{children}</>;
}
