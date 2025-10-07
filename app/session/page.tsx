"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
  return (
    <Suspense fallback={<DetachedSessionFallback />}>
      <DetachedSessionContent />
    </Suspense>
  );
}

function DetachedSessionContent() {
  const searchParams = useSearchParams();
  const sessionIdParam = searchParams.get("sessionId");
  const hostParam = searchParams.get("host") ?? "";
  const portParam = searchParams.get("port");

  const sessionId = useMemo(() => {
    return sessionIdParam && sessionIdParam.trim().length > 0 ? sessionIdParam : null;
  }, [sessionIdParam]);
  const [status, setStatus] = useState<TerminalStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [resolvedHost, setResolvedHost] = useState<string>(hostParam);
  const [resolvedPort, setResolvedPort] = useState<number | undefined>(() => {
    const parsed = portParam ? Number.parseInt(portParam, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  });

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
      <div className="flex h-full flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
        <TelnetTerminal
          host={resolvedHost}
          port={resolvedPort ?? DEFAULT_TELNET_PORT}
          dictionary={terminalDictionary}
          onStatusChange={handleStatusChange}
          sessionId={sessionId}
          mode="attach"
          isVisible
          showControls={false}
        />
      </div>
    );
  }, [handleStatusChange, resolvedHost, resolvedPort, sessionId]);

  return (
    <DesktopWindowChrome>
      <div className="flex h-full w-full flex-col bg-background">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-foreground">
              {terminalDictionary.detachedWindow.title}
            </p>
            <p className="text-xs text-muted-foreground">
              {terminalDictionary.detachedWindow.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate text-sm font-medium text-foreground">
              {hostDisplay}
            </span>
            <span className={cn("flex items-center gap-1", statusTone[status])}>
              <Circle className="h-3 w-3 fill-current" />
              {statusLabel}
            </span>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-3 px-5 py-4">
          {terminalCard}
          {error ? (
            <p className="text-xs text-destructive/80">{error}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {terminalDictionary.detachedWindow.closeHint}
            </p>
          )}
        </main>
      </div>
    </DesktopWindowChrome>
  );
}

function DetachedSessionFallback() {
  return (
    <DesktopWindowChrome>
      <div className="flex h-full w-full flex-col items-center justify-center bg-background px-6 py-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{terminalDictionary.detachedWindow.title}</span>
        </div>
      </div>
    </DesktopWindowChrome>
  );
}
