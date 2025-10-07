"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Gauge,
  Loader2,
  RadioTower,
  ShieldQuestion,
  TerminalSquare,
  WifiOff,
} from "lucide-react";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  TelnetTerminal,
  type TerminalStatus,
  type TerminalStatusChange,
} from "@/components/terminal/telnet-terminal";
import { SessionTabs } from "@/components/home/session-tabs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { Locale } from "@/lib/i18n/config";
import type {
  ConnectionState,
  HomeDictionary,
} from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

export type ConnectionStatus = {
  state: ConnectionState;
  latencyMs?: number;
  message?: string;
  httpStatus?: number;
};

const stateChipTone: Record<ConnectionState, string> = {
  idle: "bg-muted text-muted-foreground",
  checking: "bg-amber-500/10 text-amber-500",
  online: "bg-green-500/10 text-green-500",
  offline: "bg-red-500/10 text-red-500",
};

async function requestHealth(ip: string, port: number): Promise<ConnectionStatus> {
  if (typeof window !== "undefined") {
    const desktopBridge = window.desktopBridge;
    const checkHealth = desktopBridge?.pnetlab?.checkHealth;

    if (typeof checkHealth === "function") {
      const result = await checkHealth({ ip, port });

      if (!result.ok) {
        return {
          state: "offline",
          message: result.message,
          httpStatus: result.status,
        };
      }

      return {
        state: "online",
        latencyMs: result.latencyMs,
        httpStatus: result.status,
        message: result.statusText,
      };
    }
  }

  const response = await fetch("/api/pnetlab/health", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ip, port }),
  });

  const payload = (await response.json()) as {
    ok: boolean;
    latencyMs?: number;
    status?: number;
    statusText?: string;
    message?: string;
  };

  if (!response.ok || !payload.ok) {
    return {
      state: "offline",
      message: payload.message ?? payload.statusText,
      httpStatus: payload.status ?? response.status,
    };
  }

  return {
    state: "online",
    latencyMs: payload.latencyMs,
    httpStatus: payload.status ?? response.status,
    message: payload.statusText,
  };
}

const DEFAULT_HTTP_PORT = 80;
const DEFAULT_TELNET_PORT = 23;

type TelnetLaunchRequest = {
  host: string;
  port?: number;
};

type ManagedSession = {
  key: string;
  sessionId?: string;
  host: string;
  port: number;
  autoConnectToken: number;
  status: TerminalStatus;
  error: string | null;
  disposeOnUnmount: boolean;
  isDetaching?: boolean;
};

export type HomePageProps = {
  dictionary: HomeDictionary;
  locale: Locale;
};

export function HomePage({ dictionary, locale }: HomePageProps) {
  const [ip, setIp] = useState("");
  const [port, setPort] = useState(DEFAULT_HTTP_PORT);
  const [status, setStatus] = useState<ConnectionStatus>({ state: "idle" });
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [sessions, setSessions] = useState<ManagedSession[]>([]);
  const [activeSessionKey, setActiveSessionKey] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const sessionsRef = useRef<ManagedSession[]>([]);
  const activeKeyRef = useRef<string | null>(null);
  const sessionCounterRef = useRef(0);
  const autoConnectTokenRef = useRef(1);

  const generateSessionKey = useCallback(() => {
    sessionCounterRef.current += 1;
    return `session-${Date.now()}-${sessionCounterRef.current}`;
  }, []);

  const generateAutoToken = useCallback(() => {
    const nextToken = autoConnectTokenRef.current;
    autoConnectTokenRef.current += 1;
    return nextToken;
  }, []);

  const createSessionEntry = useCallback(
    (hostValue: string, portValue?: number) => {
      const trimmedHost = hostValue.trim();
      if (!trimmedHost) {
        setStatus({ state: "offline", message: dictionary.errors.missingIp });
        return null;
      }

      const portNumber =
        typeof portValue === "number" && Number.isFinite(portValue) && portValue > 0
          ? portValue
          : DEFAULT_TELNET_PORT;

      const key = generateSessionKey();
      const autoToken = generateAutoToken();

      const newSession: ManagedSession = {
        key,
        host: trimmedHost,
        port: portNumber,
        autoConnectToken: autoToken,
        status: "idle",
        error: null,
        disposeOnUnmount: true,
      };

      setSessions((prev) => [...prev, newSession]);
      setActiveSessionKey(key);
      return key;
    },
    [dictionary.errors.missingIp, generateAutoToken, generateSessionKey]
  );

  const chipCopy = useMemo(
    () => ({
      idle: {
        label: dictionary.sidebar.statusChip.idle,
        tone: stateChipTone.idle,
      },
      checking: {
        label: dictionary.sidebar.statusChip.checking,
        tone: stateChipTone.checking,
      },
      online: {
        label: dictionary.sidebar.statusChip.online,
        tone: stateChipTone.online,
      },
      offline: {
        label: dictionary.sidebar.statusChip.offline,
        tone: stateChipTone.offline,
      },
    }),
    [dictionary.sidebar.statusChip]
  );

  useEffect(() => {
    const available = typeof window !== "undefined" && Boolean(window.desktopBridge);
    setIsDesktop(available);
  }, []);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    activeKeyRef.current = activeSessionKey;
  }, [activeSessionKey]);

  const handleCheck = async () => {
    if (!ip) {
      setStatus({ state: "offline", message: dictionary.errors.missingIp });
      return;
    }

    setStatus({ state: "checking" });
    try {
      const nextStatus = await requestHealth(ip, port);
      setStatus(nextStatus);
      setLastCheckedAt(Date.now());
    } catch (error) {
      setStatus({
        state: "offline",
        message:
          error instanceof Error ? error.message : dictionary.errors.unknown,
      });
    }
  };

  const statusDescription = useMemo(() => {
    switch (status.state) {
      case "online":
        return status.latencyMs
          ? dictionary.sidebar.statusOverview.onlineWithLatency.replace(
              "{latency}",
              String(status.latencyMs)
            )
          : dictionary.sidebar.statusOverview.online;
      case "checking":
        return dictionary.sidebar.statusOverview.checking;
      case "offline":
        return (
          status.message ?? dictionary.sidebar.statusOverview.offline
        );
      default:
        return dictionary.sidebar.statusOverview.idle;
    }
  }, [dictionary, status]);

  const statusMessage = status.message ?? dictionary.statusFallback.offline;

  const activeSession = useMemo(
    () => sessions.find((session) => session.key === activeSessionKey) ?? null,
    [activeSessionKey, sessions]
  );

  const terminalErrorMessage = activeSession?.error ?? (status.state === "offline" ? statusMessage : null);

  const handleSessionStatusChange = useCallback(
    (key: string) => (payload: TerminalStatusChange) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.key === key
            ? {
                ...session,
                status: payload.status,
                error: payload.error ?? null,
              }
            : session
        )
      );
    },
    []
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

  const handleTelnetLaunch = useCallback(
    (request: TelnetLaunchRequest) => {
      if (!request.host) {
        return;
      }
      setIp(request.host);
      createSessionEntry(request.host, request.port);
    },
    [createSessionEntry]
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

  const handleDetachSession = useCallback(
    async (key: string) => {
      const target = sessionsRef.current.find((session) => session.key === key);
      if (!target || !target.sessionId) {
        return;
      }

      const openSessionWindow = window.desktopBridge?.window?.openSessionWindow;
      if (!openSessionWindow) {
        setSessions((prev) =>
          prev.map((session) =>
            session.key === key
              ? {
                  ...session,
                  error: dictionary.terminal.desktopOnlyHint,
                }
              : session
          )
        );
        return;
      }

      setSessions((prev) =>
        prev.map((session) =>
          session.key === key
            ? {
                ...session,
                isDetaching: true,
                disposeOnUnmount: false,
              }
            : session
        )
      );

      const titleLabel = target.host
        ? `${target.host}${target.port ? `:${target.port}` : ""}`
        : target.sessionId;

      try {
        const success = await openSessionWindow({ sessionId: target.sessionId, title: titleLabel });
        if (!success) {
          throw new Error("Detached window request was rejected");
        }

        setSessions((prev) => {
          const next = prev.filter((session) => session.key !== key);
          if (activeKeyRef.current === key) {
            const fallback = next[next.length - 1] ?? null;
            setActiveSessionKey(fallback?.key ?? null);
          }
          return next;
        });
      } catch (error) {
        console.error("Failed to detach session", error);
        setSessions((prev) =>
          prev.map((session) =>
            session.key === key
              ? {
                  ...session,
                  isDetaching: false,
                  disposeOnUnmount: true,
                  error: dictionary.terminal.desktopOnlyHint,
                }
              : session
          )
        );
      }
    },
    [dictionary.terminal.desktopOnlyHint]
  );

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
      .then((requests) => {
        if (!active || !requests) {
          return;
        }
        requests.forEach((request) => handleTelnetLaunch(request));
      })
      .catch((error) => {
        console.error("Failed to initialize telnet bridge", error);
      });

    const unsubscribe = telnetBridge.onRequests?.((requests) => {
      if (!active) {
        return;
      }
      requests.forEach((request) => handleTelnetLaunch(request));
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [handleTelnetLaunch]);

  return (
    <div
      className={cn(
        "flex min-h-screen bg-gradient-to-br from-background via-background to-muted/40",
        isDesktop && "h-full min-h-0"
      )}
    >
      <aside className="hidden w-[320px] border-r bg-card/60 backdrop-blur lg:flex lg:flex-col">
        <div className="space-y-2 border-b px-6 py-6">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <RadioTower className="h-4 w-4" /> {dictionary.navigation.brand}
          </div>
          <p className="text-2xl font-semibold">{dictionary.sidebar.title}</p>
          <p className="text-sm text-muted-foreground">
            {dictionary.sidebar.description}
          </p>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                {dictionary.sidebar.controllerLabel}
              </p>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${chipCopy[status.state].tone}`}
              >
                {chipCopy[status.state].label}
              </span>
            </div>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="pnet-ip">{dictionary.sidebar.ipLabel}</Label>
                <Input
                  id="pnet-ip"
                  placeholder={dictionary.sidebar.ipPlaceholder}
                  value={ip}
                  onChange={(event) => setIp(event.target.value.trim())}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pnet-port">{dictionary.sidebar.portLabel}</Label>
                <Input
                  id="pnet-port"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={65535}
                  value={port}
                  onChange={(event) =>
                    setPort(Number(event.target.value) || DEFAULT_HTTP_PORT)
                  }
                />
              </div>
              <Button onClick={handleCheck} disabled={status.state === "checking"}>
                {status.state === "checking" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {dictionary.sidebar.checkingButton}
                  </>
                ) : (
                  <>
                    <Activity className="mr-2 h-4 w-4" />
                    {dictionary.sidebar.checkButton}
                  </>
                )}
              </Button>
            </div>
          </section>

          <Separator className="bg-border/60" />

          <section className="space-y-3 rounded-xl border border-dashed border-border/60 bg-background/60 p-4">
            <div className="flex items-center gap-3">
              {status.state === "online" ? (
                <Gauge className="h-5 w-5 text-green-500" />
              ) : status.state === "offline" ? (
                <WifiOff className="h-5 w-5 text-red-500" />
              ) : (
                <ShieldQuestion className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-semibold">
                  {dictionary.sidebar.statusOverviewTitle}
                </p>
                <p className="text-xs text-muted-foreground">{statusDescription}</p>
              </div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              <p>{dictionary.sidebar.futurePlanHint}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {dictionary.sidebar.futurePlans.map((plan) => (
                  <li key={plan}>{plan}</li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-muted-foreground/80">
              {dictionary.sidebar.lastCheckPrefix}
              {lastCheckedAt
                ? new Date(lastCheckedAt).toLocaleTimeString(locale)
                : dictionary.sidebar.lastCheckNever}
            </p>
          </section>
        </div>
      </aside>

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
            <Suspense
              fallback={
                <div
                  className="h-10 w-24 animate-pulse rounded-md border border-dashed border-border/60 bg-muted/40"
                  aria-hidden
                />
              }
            >
              <LocaleSwitcher copy={dictionary.navigation.languageSwitch} />
            </Suspense>
            <ThemeToggle />
          </div>
        </header>

        <section className="flex flex-1 flex-col gap-6 px-6 py-6">
          <Card className="flex min-h-[520px] flex-1 flex-col overflow-hidden">
            <CardHeader className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle>{dictionary.main.cardTitle}</CardTitle>
                <CardDescription>{dictionary.main.cardDescription}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4 p-6">
              <div className="flex flex-1 flex-col gap-3">
                <SessionTabs
                  sessions={sessions.map((session) => ({
                    key: session.key,
                    host: session.host,
                    port: session.port,
                    status: session.status,
                    isActive: session.key === activeSessionKey,
                    isDetaching: session.isDetaching,
                  }))}
                  dictionary={dictionary.terminal}
                  onSelect={handleSelectSession}
                  onClose={handleCloseSession}
                  onDetach={handleDetachSession}
                />

                {sessions.length > 0 && (
                  <div className="relative flex-1 overflow-hidden rounded-lg border border-border/70 bg-card/90 shadow-inner min-h-[360px]">
                    {sessions.map((session) => {
                      const isActive = session.key === activeSessionKey;
                      return (
                        <div
                          key={session.key}
                          className={cn(
                            "absolute inset-0 flex flex-col transition-opacity duration-200",
                            isActive ? "z-10 opacity-100" : "pointer-events-none opacity-0"
                          )}
                          aria-hidden={!isActive}
                        >
                          <TelnetTerminal
                            host={session.host}
                            port={session.port}
                            dictionary={dictionary.terminal}
                            autoConnectSignal={session.autoConnectToken}
                            onStatusChange={handleSessionStatusChange(session.key)}
                            onSessionCreated={handleSessionCreated(session.key)}
                            sessionId={session.sessionId}
                            isVisible={isActive}
                            disposeOnUnmount={session.disposeOnUnmount}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {terminalErrorMessage && (
                <p className="text-xs text-destructive/80">{terminalErrorMessage}</p>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
