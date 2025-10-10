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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { Locale } from "@/lib/i18n/config";
import type { HomeDictionary } from "@/lib/i18n/dictionaries";
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

export type HomePageProps = {
  dictionary: HomeDictionary;
  locale: Locale;
};

export function HomePage({ dictionary, locale }: HomePageProps) {
  const [ip, setIp] = useState("");
  const [port, setPort] = useState(DEFAULT_TELNET_PORT);
  const [sessions, setSessions] = useState<ManagedSession[]>([]);
  const [activeSessionKey, setActiveSessionKey] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
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
    (hostValue: string, portValue?: number, labelValue?: string | null) => {
      const trimmedHost = hostValue.trim();
      if (!trimmedHost) {
        return null;
      }

      const portNumber =
        typeof portValue === "number" && Number.isFinite(portValue) && portValue > 0
          ? portValue
          : DEFAULT_TELNET_PORT;

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
    sessionsRef.current = sessions;
  }, [sessions]);

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

  const handleTelnetOpen = useCallback(
    (request: TelnetLaunchRequest) => {
      if (!request.host) {
        return;
      }
      setIp(request.host);
      createSessionEntry(request.host, request.port, request.label ?? null);
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
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {dictionary.sidebar.quickConnectTitle}
              </p>
            </div>
            <form className="grid gap-4" onSubmit={handleQuickConnect}>
              <div className="grid gap-2">
                <Label htmlFor="pnet-ip">{dictionary.sidebar.ipLabel}</Label>
                <Input
                  id="pnet-ip"
                  placeholder={dictionary.sidebar.ipPlaceholder}
                  value={ip}
                  onChange={(event) => setIp(event.target.value)}
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
                    setPort(Number(event.target.value) || DEFAULT_TELNET_PORT)
                  }
                />
              </div>
              <Button type="submit">{dictionary.sidebar.connectButton}</Button>
            </form>
            {formError ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <Info className="mt-0.5 h-4 w-4" />
                <span>{formError}</span>
              </div>
            ) : null}
          </section>
          <Separator className="bg-border/60" />

          <section className="space-y-3 rounded-xl border border-border/60 bg-background/70 p-4">
            <p className="text-sm font-semibold text-foreground/80">
              {dictionary.sidebar.tipsTitle}
            </p>
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
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/${locale}/settings`}>
                <Settings2 className="h-4 w-4" />
                {dictionary.navigation.settingsLabel}
              </Link>
            </Button>
          </div>
        </header>

        <section className="flex flex-1 flex-col gap-4 px-6 py-6">
          <div className="flex min-h-0 flex-1 flex-col gap-4 rounded-xl border border-border/70 bg-background/80 p-5 shadow-sm">
            <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
              <div className="flex min-h-0 w-full flex-col gap-3 lg:max-w-[320px]">
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
              <div className="flex min-h-0 flex-1">
                {sessions.length > 0 ? (
                  <div className="relative flex min-h-[420px] flex-1 overflow-hidden rounded-lg border border-border/70 bg-card/90 shadow-inner">
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
                            label={session.label}
                            dictionary={dictionary.terminal}
                            autoConnectSignal={session.autoConnectToken}
                            onStatusChange={handleSessionStatusChange(session.key)}
                            onSessionCreated={handleSessionCreated(session.key)}
                            sessionId={session.sessionId}
                            isVisible={isActive}
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
