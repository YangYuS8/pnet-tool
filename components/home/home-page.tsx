"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Info, RadioTower, Settings2, TerminalSquare } from "lucide-react";

import {
  TelnetTerminal,
  type TerminalStatus,
  type TerminalStatusChange,
} from "@/components/terminal/telnet-terminal";
import { SessionTabs } from "@/components/home/session-tabs";
import { useLocaleDictionary } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const DEFAULT_TELNET_PORT = 23;

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

type ManagedSession = {
  key: string;
  sessionId?: string;
  host: string;
  port: number;
  label: string;
  autoConnectToken: number;
  status: TerminalStatus;
  error: string | null;
};

const RECENT_CONNECTION_LIMIT = 12;
const LOCAL_RECENTS_STORAGE_KEY = "pnet:recent-connections:v1";
const SESSION_STORAGE_KEY = "pnet:active-terminal-sessions:v2";
const SESSION_ACTIVE_STORAGE_KEY = "pnet:active-terminal-session-key:v2";

type RecentConnectionRecord = {
  host: string;
  port: number;
  label: string;
  lastConnectedAt: number;
};

type PersistedSessionSnapshot = {
  key: string;
  sessionId: string;
  host: string;
  port: number;
  label: string;
};

function sanitizePortValue(value: unknown, fallback = DEFAULT_TELNET_PORT) {
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

function sanitizeRecentConnectionRecord(
  entry: Partial<RecentConnectionRecord> | null | undefined
): RecentConnectionRecord | null {
  if (!entry) {
    return null;
  }
  const host = typeof entry.host === "string" ? entry.host.trim() : "";
  if (!host) {
    return null;
  }
  const port = sanitizePortValue(entry.port);
  const rawLabel = typeof entry.label === "string" ? entry.label : host;
  const label = rawLabel.trim() || host;
  const timestamp =
    typeof entry.lastConnectedAt === "number" && Number.isFinite(entry.lastConnectedAt)
      ? entry.lastConnectedAt
      : Date.now();

  return {
    host,
    port,
    label,
    lastConnectedAt: timestamp,
  } satisfies RecentConnectionRecord;
}

function mergeRecentConnectionRecords(records: RecentConnectionRecord[]): RecentConnectionRecord[] {
  const map = new Map<string, RecentConnectionRecord>();
  for (const record of records) {
    const key = `${record.host.toLowerCase()}::${record.port}`;
    const existing = map.get(key);
    if (!existing || existing.lastConnectedAt < record.lastConnectedAt) {
      map.set(key, record);
    }
  }
  const merged = Array.from(map.values());
  merged.sort((a, b) => b.lastConnectedAt - a.lastConnectedAt);
  return merged.slice(0, RECENT_CONNECTION_LIMIT);
}

function sanitizePersistedSessionSnapshot(
  entry: Partial<PersistedSessionSnapshot> | null | undefined
): PersistedSessionSnapshot | null {
  if (!entry) {
    return null;
  }
  const key = typeof entry.key === "string" ? entry.key.trim() : "";
  const sessionId = typeof entry.sessionId === "string" ? entry.sessionId.trim() : "";
  const host = typeof entry.host === "string" ? entry.host.trim() : "";
  if (!key || !sessionId || !host) {
    return null;
  }
  const port = sanitizePortValue(entry.port);
  const rawLabel = typeof entry.label === "string" ? entry.label : host;
  const label = rawLabel.trim() || host;

  return {
    key,
    sessionId,
    host,
    port,
    label,
  } satisfies PersistedSessionSnapshot;
}

export function HomePage() {
  const { dictionary } = useLocaleDictionary("home");
  const [ip, setIp] = useState("");
  const [port, setPort] = useState(DEFAULT_TELNET_PORT);
  const [sessions, setSessions] = useState<ManagedSession[]>([]);
  const [activeSessionKey, setActiveSessionKey] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [showWorkbench, setShowWorkbench] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [recentConnections, setRecentConnections] = useState<RecentConnectionRecord[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    try {
      const raw = window.localStorage?.getItem(LOCAL_RECENTS_STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as Array<Partial<RecentConnectionRecord>>;
      if (!Array.isArray(parsed)) {
        return [];
      }
      const sanitized = parsed
        .map(sanitizeRecentConnectionRecord)
        .filter((entry): entry is RecentConnectionRecord => Boolean(entry));
      return mergeRecentConnectionRecords(sanitized);
    } catch (error) {
      console.warn("Failed to read recent connections from local storage", error);
      return [];
    }
  });
  const sessionsRef = useRef<ManagedSession[]>([]);
  const activeKeyRef = useRef<string | null>(null);
  const autoConnectTokenRef = useRef(1);

  const generateSessionKey = useCallback(() => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `session-${crypto.randomUUID()}`;
    }
    const random = Math.random().toString(36).slice(2, 10);
    return `session-${Date.now()}-${random}`;
  }, []);

  const generateAutoToken = useCallback(() => {
    const nextToken = autoConnectTokenRef.current;
    autoConnectTokenRef.current += 1;
    return nextToken;
  }, []);

  const createSessionEntry = useCallback(
    (hostValue: string, portValue?: number, labelValue?: string | null) => {
      const trimmedHost = hostValue.trim();
      if (!trimmedHost) {
        return null;
      }

      const portNumber = sanitizePortValue(portValue);

      const key = generateSessionKey();
      const autoToken = generateAutoToken();
      const sessionLabel =
        typeof labelValue === "string" && labelValue.trim().length > 0 ? labelValue.trim() : trimmedHost;

      const newSession: ManagedSession = {
        key,
        host: trimmedHost,
        port: portNumber,
        label: sessionLabel,
        autoConnectToken: autoToken,
        status: "idle",
        error: null,
      };

      setSessions((prev) => [...prev, newSession]);
      setActiveSessionKey(key);
      return key;
    },
    [generateAutoToken, generateSessionKey]
  );

  useEffect(() => {
    const available = typeof window !== "undefined" && Boolean(window.desktopBridge);
    setIsDesktop(available);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      if (recentConnections.length > 0) {
        window.localStorage.setItem(
          LOCAL_RECENTS_STORAGE_KEY,
          JSON.stringify(recentConnections)
        );
      } else {
        window.localStorage.removeItem(LOCAL_RECENTS_STORAGE_KEY);
      }
    } catch (error) {
      console.warn("Failed to persist recent connections locally", error);
    }
  }, [recentConnections]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    let active = true;

    const bootstrap = async () => {
      try {
        const settings = await window.desktopBridge?.settings?.get();
        if (!active || !settings?.recentConnections) {
          return;
        }
        const sanitized = settings.recentConnections
          .map(sanitizeRecentConnectionRecord)
          .filter((entry): entry is RecentConnectionRecord => Boolean(entry));
        if (sanitized.length === 0) {
          return;
        }
        setRecentConnections((prev) => {
          if (prev.length === 0) {
            return mergeRecentConnectionRecords(sanitized);
          }
          return mergeRecentConnectionRecords([...sanitized, ...prev]);
        });
      } catch (error) {
        console.warn("Failed to load recent connections from desktop settings", error);
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // 从 localStorage 恢复上次的会话标签与参数（不恢复运行中的 PTY id）
  useEffect(() => {
    if (typeof window === "undefined") return;
    let restored = false;
    try {
      const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Array<Partial<PersistedSessionSnapshot>>;
        const snapshots = Array.isArray(parsed)
          ? parsed
              .map(sanitizePersistedSessionSnapshot)
              .filter((v): v is PersistedSessionSnapshot => Boolean(v))
          : [];
        if (snapshots.length > 0) {
          setSessions((prev) => {
            // 避免重复恢复：如果已有会话则不覆盖
            if (prev.length > 0) return prev;
            restored = true;
            return snapshots.map((s) => ({
              key: s.key,
              sessionId: undefined,
              host: s.host,
              port: s.port,
              label: s.label,
              autoConnectToken: generateAutoToken(),
              status: "idle",
              error: null,
            }));
          });
        }
        if (restored) {
          const storedActive = window.localStorage.getItem(SESSION_ACTIVE_STORAGE_KEY);
          if (storedActive && snapshots.some((snapshot) => snapshot.key === storedActive)) {
            setActiveSessionKey((prev) => prev ?? storedActive);
          }
        }
      }
    } catch (e) {
      console.warn("Failed to restore sessions", e);
    }
  }, [generateAutoToken]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const onLabel = window.desktopBridge?.terminal?.onLabel;
    if (!onLabel) {
      return;
    }
    const unsubscribe = onLabel(({ id, label, host, port }) => {
      if (!id) {
        return;
      }
      setSessions((prev) =>
        prev.map((session) => {
          if (session.sessionId !== id) {
            return session;
          }
          const nextLabel =
            typeof label === "string" && label.trim().length > 0 ? label.trim() : session.label;
          const nextHost = host ?? session.host;
          const nextPort =
            typeof port === "number" && Number.isFinite(port) && port > 0 ? port : session.port;
          return {
            ...session,
            label: nextLabel,
            host: nextHost,
            port: nextPort,
          };
        })
      );
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    activeKeyRef.current = activeSessionKey;
  }, [activeSessionKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const snapshots = sessions.map((session) => ({
        key: session.key,
        sessionId: session.sessionId ?? "",
        host: session.host,
        port: session.port,
        label: session.label,
      }));
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshots));
      if (activeSessionKey) {
        window.localStorage.setItem(SESSION_ACTIVE_STORAGE_KEY, activeSessionKey);
      } else {
        window.localStorage.removeItem(SESSION_ACTIVE_STORAGE_KEY);
      }
    } catch (error) {
      console.warn("Failed to persist terminal sessions", error);
    }
  }, [sessions, activeSessionKey]);

  useEffect(() => {
    if (sessions.length === 0) {
      if (activeSessionKey !== null) {
        setActiveSessionKey(null);
      }
      return;
    }
    if (activeSessionKey && sessions.some((session) => session.key === activeSessionKey)) {
      return;
    }
    const fallback = sessions[0]?.key ?? null;
    if (fallback !== activeSessionKey) {
      setActiveSessionKey(fallback);
    }
  }, [sessions, activeSessionKey]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.key === activeSessionKey) ?? null,
    [activeSessionKey, sessions]
  );

  const terminalErrorMessage = activeSession?.error ?? null;

  const handleQuickConnect = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const trimmedHost = ip.trim();
      if (!trimmedHost) {
        setFormError(dictionary.errors.missingHost);
        return;
      }
      const key = createSessionEntry(trimmedHost, port, trimmedHost);
      if (!key) {
        setFormError(dictionary.errors.missingHost);
        return;
      }
      setFormError(null);
      setIp(trimmedHost);
    },
    [createSessionEntry, dictionary.errors.missingHost, ip, port]
  );

  const persistRecentConnection = useCallback(
    async (connection: { host: string; port: number; label: string }) => {
      const host = connection.host.trim();
      if (!host) {
        return;
      }
      const port = sanitizePortValue(connection.port);
      const label = connection.label.trim().length ? connection.label.trim() : host;
      const entry: RecentConnectionRecord = {
        host,
        port,
        label,
        lastConnectedAt: Date.now(),
      };

      setRecentConnections((prev) => mergeRecentConnectionRecords([entry, ...prev]));

      try {
        await window.desktopBridge?.settings?.addRecentConnection({ host, port, label });
      } catch (error) {
        console.warn("Failed to persist recent connection", error);
      }
    },
    []
  );

  const handleClearRecentConnections = useCallback(async () => {
    setRecentConnections([]);
    try {
      await window.desktopBridge?.settings?.clearRecentConnections();
    } catch (error) {
      console.warn("Failed to clear recent connections", error);
    }
  }, []);

  const handleLaunchRecentConnection = useCallback(
    (connection: RecentConnectionRecord) => {
      setIp(connection.host);
      setPort(connection.port);
      setFormError(null);
      createSessionEntry(connection.host, connection.port, connection.label);
    },
    [createSessionEntry]
  );

  const handleSessionStatusChange = useCallback(
    (key: string) => (payload: TerminalStatusChange) => {
      let connectionToPersist: { host: string; port: number; label: string } | null = null;

      setSessions((prev) =>
        prev.map((session) => {
          if (session.key !== key) {
            return session;
          }
          const wasConnected = session.status === "connected";
          const nextSession: ManagedSession = {
            ...session,
            status: payload.status,
            error: payload.error ?? null,
          };
          if (payload.status === "connected" && !wasConnected && nextSession.sessionId) {
            connectionToPersist = {
              host: nextSession.host,
              port: nextSession.port,
              label: nextSession.label,
            };
          }
          return nextSession;
        })
      );

      if (connectionToPersist) {
        void persistRecentConnection(connectionToPersist);
      }
    },
    [persistRecentConnection]
  );

  const handleSessionCreated = useCallback(
    (key: string) => (sessionId: string) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.key === key && session.sessionId !== sessionId
            ? {
                ...session,
                sessionId,
              }
            : session
        )
      );
    },
    []
  );

  const handleTelnetOpen = useCallback(
    (request: TelnetLaunchRequest) => {
      if (!request.host) {
        return;
      }
      const trimmedHost = request.host.trim();
      const portNumber = sanitizePortValue(request.port);
      
      // 检查是否已存在相同 host:port 的会话
      const existing = sessionsRef.current.find(
        (s) => s.host === trimmedHost && s.port === portNumber
      );
      
      if (existing) {
        // 如果已存在，直接跳转到该会话
        setActiveSessionKey(existing.key);
        return;
      }
      
      // 否则创建新会话
      setIp(trimmedHost);
      setPort(portNumber);
      createSessionEntry(trimmedHost, portNumber, request.label ?? null);
    },
    [createSessionEntry]
  );

  const focusSessionById = useCallback(
    (sessionId: string) => {
      const target = sessionsRef.current.find((session) => session.sessionId === sessionId);
      if (target) {
        setActiveSessionKey(target.key);
      }
    },
    []
  );

  const handleTelnetAction = useCallback(
    (action: TelnetAction) => {
      if (action.type === "open") {
        handleTelnetOpen(action.request);
        return;
      }

      focusSessionById(action.sessionId);

      if (action.label || action.host || typeof action.port === "number") {
        setSessions((prev) =>
          prev.map((session) => {
            if (session.sessionId !== action.sessionId) {
              return session;
            }
            const nextLabel =
              typeof action.label === "string" && action.label.trim().length > 0
                ? action.label.trim()
                : session.label;
            const nextHost = action.host ?? session.host;
            const nextPort =
              typeof action.port === "number" && Number.isFinite(action.port) && action.port > 0
                ? action.port
                : session.port;
            return {
              ...session,
              label: nextLabel,
              host: nextHost,
              port: nextPort,
            };
          })
        );
      }
    },
    [focusSessionById, handleTelnetOpen]
  );

  const handleSelectSession = useCallback((key: string) => {
    setActiveSessionKey(key);
  }, []);

  const handleCloseSession = useCallback(
    async (key: string) => {
      const target = sessionsRef.current.find((session) => session.key === key);
      const sessionId = target?.sessionId;

      if (sessionId && window.desktopBridge?.terminal) {
        try {
          await window.desktopBridge.terminal.dispose(sessionId);
        } catch (error) {
          console.error("Failed to dispose terminal session", error);
        }
      }

      setSessions((prev) => {
        const next = prev.filter((session) => session.key !== key);
        if (activeKeyRef.current === key) {
          const fallback = next[next.length - 1] ?? null;
          setActiveSessionKey(fallback?.key ?? null);
        }
        return next;
      });
    },
    []
  );

  const handleTabReorder = useCallback((sourceKey: string, targetKey: string | null) => {
    setSessions((prev) => {
      if (sourceKey === targetKey) {
        return prev;
      }
      const sourceIndex = prev.findIndex((session) => session.key === sourceKey);
      if (sourceIndex === -1) {
        return prev;
      }

      const next = [...prev];
      const [moved] = next.splice(sourceIndex, 1);
      if (!moved) {
        return prev;
      }

      if (!targetKey) {
        next.push(moved);
        return next;
      }

      let targetIndex = prev.findIndex((session) => session.key === targetKey);
      if (targetIndex === -1) {
        next.push(moved);
        return next;
      }

      if (sourceIndex < targetIndex) {
        targetIndex -= 1;
      }

      next.splice(Math.max(targetIndex, 0), 0, moved);
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const telnetBridge = window.desktopBridge?.telnet;
    if (!telnetBridge) {
      return;
    }
    let active = true;
    telnetBridge
      .ready()
      .then((actions) => {
        if (!active || !actions) {
          return;
        }
        actions.forEach((action) => handleTelnetAction(action));
      })
      .catch((error) => {
        console.error("Failed to initialize telnet bridge", error);
      });

    const unsubscribe = telnetBridge.onRequests?.((actions) => {
      if (!active) {
        return;
      }
      actions.forEach((action) => handleTelnetAction(action));
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [handleTelnetAction]);

  return (
    <div
      className={cn(
        "flex min-h-screen bg-gradient-to-br from-background via-background to-muted/40",
        isDesktop && "h-full min-h-0"
      )}
    >
      {/* 可折叠侧面板：连接工作台（不改变主区域占比，采用覆盖式抽屉） */}
      {showWorkbench && (
        <div className="fixed left-0 top-16 bottom-0 z-40 w-[320px] border-r bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-xl">
          <div className="space-y-2 border-b px-6 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <RadioTower className="h-4 w-4" /> {dictionary.navigation.brand}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setShowWorkbench(false)}>✕</Button>
            </div>
            <p className="text-2xl font-semibold">{dictionary.sidebar.title}</p>
            <p className="text-sm text-muted-foreground">{dictionary.sidebar.description}</p>
          </div>

          <div className="flex h-[calc(100%-6rem)] flex-col space-y-6 overflow-y-auto px-6 py-6">
            <section className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{dictionary.sidebar.quickConnectTitle}</p>
              </div>
              <form className="grid gap-4" onSubmit={handleQuickConnect}>
                <div className="grid gap-2">
                  <Label htmlFor="pnet-ip">{dictionary.sidebar.ipLabel}</Label>
                  <Input id="pnet-ip" placeholder={dictionary.sidebar.ipPlaceholder} value={ip} onChange={(event) => setIp(event.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pnet-port">{dictionary.sidebar.portLabel}</Label>
                  <Input id="pnet-port" type="number" inputMode="numeric" min={1} max={65535} value={port} onChange={(event) => setPort(sanitizePortValue(event.target.value))} />
                </div>
                <Button type="submit">{dictionary.sidebar.connectButton}</Button>
              </form>
              {formError ? (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  <Info className="mt-0.5 h-4 w-4" />
                  <span>{formError}</span>
                </div>
              ) : null}
              <div className="space-y-3 rounded-xl border border-border/60 bg-background/70 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground/80">{dictionary.sidebar.recentTitle}</p>
                  {recentConnections.length > 0 ? (
                    <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground" onClick={() => { void handleClearRecentConnections(); }}>
                      {dictionary.sidebar.recentClearLabel}
                    </Button>
                  ) : null}
                </div>
                {recentConnections.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {recentConnections.map((connection) => {
                      const key = `${connection.host}:${connection.port}`;
                      const displayHost = connection.port ? `${connection.host}:${connection.port}` : connection.host;
                      return (
                        <Button
                          key={key}
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-9 justify-between px-3 text-left"
                          onClick={() => handleLaunchRecentConnection(connection)}
                        >
                          <span className="truncate font-medium">{connection.label}</span>
                          <span className="text-[11px] text-muted-foreground">{displayHost}</span>
                        </Button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground/70">{dictionary.sidebar.recentEmpty}</p>
                )}
              </div>
            </section>
            <Separator className="bg-border/60" />
            <section className="space-y-3 rounded-xl border border-border/60 bg-background/70 p-4">
              <p className="text-sm font-semibold text-foreground/80">{dictionary.sidebar.tipsTitle}</p>
              <ul className="space-y-2 text-xs text-muted-foreground">
                {dictionary.sidebar.tips.map((tip) => (
                  <li key={tip} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-muted-foreground/50" aria-hidden />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}

      <main className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-background/90 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/60">
              <TerminalSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">
                {dictionary.navigation.sessionTitle}
              </p>
              <p className="text-xs text-muted-foreground">
                {dictionary.navigation.sessionSubtitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowWorkbench((v) => !v)} className="hidden lg:inline-flex">
              {showWorkbench ? dictionary.sidebar.title : dictionary.sidebar.title}
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/settings">
                <Settings2 className="h-4 w-4" />
                {dictionary.navigation.settingsLabel}
              </Link>
            </Button>
          </div>
        </header>

        <section className="flex flex-1 flex-col gap-4 px-6 py-6 overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col gap-4 rounded-xl border border-border/70 bg-background/80 p-5 shadow-sm overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row overflow-hidden">
              <div className="flex min-h-0 w-full flex-col gap-3 overflow-y-auto lg:max-w-[320px] lg:max-h-full">
                <SessionTabs
                  sessions={sessions.map((session) => ({
                    key: session.key,
                    host: session.host,
                    port: session.port,
                    label: session.label,
                    status: session.status,
                    isActive: session.key === activeSessionKey,
                  }))}
                  dictionary={dictionary.terminal}
                  onSelect={handleSelectSession}
                  onClose={handleCloseSession}
                  onReorder={handleTabReorder}
                />
              </div>
              <div className="flex min-h-0 flex-1 overflow-hidden">
                {sessions.length > 0 ? (
                  <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border/70 bg-card/90 shadow-inner">
                    {sessions.map((session) => {
                      const isActive = session.key === activeSessionKey;
                      return (
                        <div
                          key={session.key}
                          className={cn(
                            "absolute inset-0 flex flex-col transition-opacity duration-200 overflow-hidden",
                            isActive ? "z-10 opacity-100" : "pointer-events-none opacity-0"
                          )}
                          aria-hidden={!isActive}
                        >
                          <TelnetTerminal
                            host={session.host}
                            port={session.port}
                            label={session.label}
                            dictionary={dictionary.terminal}
                            autoConnectSignal={session.autoConnectToken}
                            onStatusChange={handleSessionStatusChange(session.key)}
                            onSessionCreated={handleSessionCreated(session.key)}
                            sessionId={session.sessionId}
                            mode={session.sessionId ? "attach" : "create"}
                            isVisible={isActive}
                            disposeOnUnmount={false}
                            className="flex-1"
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/10 p-6 text-center text-sm text-muted-foreground">
                    <div className="max-w-[320px] space-y-2">
                      <p className="text-base font-semibold text-foreground/80">
                        {dictionary.terminal.sessionTabs.emptyTitle}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dictionary.terminal.sessionTabs.emptyDescription}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {terminalErrorMessage && (
              <p className="text-xs text-destructive/80">{terminalErrorMessage}</p>
            )}
          </div>
        </section>
      </main>

    </div>
  );
}
