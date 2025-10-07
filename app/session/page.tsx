"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Circle, Loader2 } from "lucide-react";

import { DesktopWindowChrome } from "@/components/desktop/window-chrome";
import {
  TelnetTerminal,
  type TerminalStatus,
  type TerminalStatusChange,
} from "@/components/terminal/telnet-terminal";
import { home as zhCNHome } from "@/locales/zh-CN";
import { cn } from "@/lib/utils";

const terminalDictionary = zhCNHome.terminal;
const DEFAULT_TELNET_PORT = 23;

const statusTone: Record<TerminalStatus, string> = {
  idle: "text-muted-foreground",
  connecting: "text-amber-500",
  connected: "text-emerald-500",
  closed: "text-muted-foreground",
  error: "text-destructive",
};

export default function DetachedSessionPage() {
  const searchParams = useSearchParams();
  const sessionIdParam = searchParams.get("sessionId");
  const hostParam = searchParams.get("host") ?? "";
  const portParam = searchParams.get("port");

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [autoConnectSignal, setAutoConnectSignal] = useState(0);
  const [status, setStatus] = useState<TerminalStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [resolvedHost, setResolvedHost] = useState<string>(hostParam);
  const [resolvedPort, setResolvedPort] = useState<number | undefined>(() => {
    const parsed = portParam ? Number.parseInt(portParam, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  });

  useEffect(() => {
    if (!sessionIdParam) {
      return;
    }
    setSessionId(sessionIdParam);
    setAutoConnectSignal((token) => token + 1);
  }, [sessionIdParam]);

  useEffect(() => {
    if (!sessionId || !window.desktopBridge?.terminal?.describe) {
      return;
    }
    let cancelled = false;
    window.desktopBridge.terminal
      .describe(sessionId)
      .then((details) => {
        if (cancelled || !details) {
          return;
        }
        if (details.host) {
          setResolvedHost(details.host);
        }
        if (typeof details.port === "number" && Number.isFinite(details.port) && details.port > 0) {
          setResolvedPort(details.port);
        }
      })
      .catch((describeError) => {
        console.warn("Failed to describe terminal session", describeError);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const handleStatusChange = useCallback((payload: TerminalStatusChange) => {
    setStatus(payload.status);
    setError(payload.error ?? null);
  }, []);

  const statusLabel = useMemo(() => terminalDictionary.status[status], [status]);

  const hostDisplay = useMemo(() => {
    if (resolvedHost) {
      return resolvedPort ? `${resolvedHost}:${resolvedPort}` : resolvedHost;
    }
    return terminalDictionary.detachedWindow.title;
  }, [resolvedHost, resolvedPort]);

  const terminalCard = useMemo(() => {
    if (!sessionId) {
      return (
        <div className="flex h-full flex-1 items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/10 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {"等待会话 ID…"}
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full flex-1 flex-col rounded-lg border border-border/70 bg-card/95 shadow-inner">
        <TelnetTerminal
          host={resolvedHost}
          port={resolvedPort ?? DEFAULT_TELNET_PORT}
          dictionary={terminalDictionary}
          autoConnectSignal={autoConnectSignal}
          onStatusChange={handleStatusChange}
          sessionId={sessionId}
          mode="attach"
          isVisible
        />
      </div>
    );
  }, [autoConnectSignal, handleStatusChange, resolvedHost, resolvedPort, sessionId]);

  return (
    <DesktopWindowChrome>
      <div className="flex h-full w-full flex-col bg-gradient-to-br from-background via-background to-muted/40">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-background/80 px-6 py-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground/90">
              {terminalDictionary.detachedWindow.title}
            </p>
            <p className="text-xs text-muted-foreground/80">
              {terminalDictionary.detachedWindow.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground/80">
            <span className="truncate text-sm font-medium text-foreground/90">
              {hostDisplay}
            </span>
            <span className={cn("flex items-center gap-1", statusTone[status])}>
              <Circle className="h-3 w-3 fill-current" />
              {statusLabel}
            </span>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-3 px-6 py-6">
          {terminalCard}
          {error ? (
            <p className="text-xs text-destructive/80">{error}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground/70">
              {terminalDictionary.detachedWindow.closeHint}
            </p>
          )}
        </main>
      </div>
    </DesktopWindowChrome>
  );
}
