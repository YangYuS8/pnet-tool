"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Terminal as XtermTerminal } from "@xterm/xterm";
import type { FitAddon as FitAddonClass } from "@xterm/addon-fit";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { HomeDictionary } from "@/lib/i18n/dictionaries";

export type TelnetTerminalProps = {
  host: string;
  port: number;
  dictionary: HomeDictionary["terminal"];
};

type TerminalStatus = "idle" | "connecting" | "connected" | "closed" | "error";

type CleanupDisposer = (() => void) | null;

export function TelnetTerminal({ host, port, dictionary }: TelnetTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XtermTerminal | null>(null);
  const fitAddonRef = useRef<FitAddonClass | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const dataDisposerRef = useRef<CleanupDisposer>(null);
  const exitDisposerRef = useRef<CleanupDisposer>(null);
  const errorDisposerRef = useRef<CleanupDisposer>(null);
  const resizeDisposerRef = useRef<CleanupDisposer>(null);

  const [status, setStatus] = useState<TerminalStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isDesktopAvailable, setDesktopAvailable] = useState(false);
  const [isDisposing, setIsDisposing] = useState(false);

  useEffect(() => {
    setDesktopAvailable(typeof window !== "undefined" && Boolean(window.desktopBridge?.terminal));
  }, []);

  const statusLabel = useMemo(() => {
    switch (status) {
      case "connecting":
        return dictionary.status.connecting;
      case "connected":
        return dictionary.status.connected;
      case "closed":
        return dictionary.status.closed;
      case "error":
        return dictionary.status.error;
      default:
        return dictionary.status.idle;
    }
  }, [dictionary.status, status]);

  const cleanupSession = useCallback(
    async (killProcess: boolean) => {
      const sessionId = sessionIdRef.current;

      dataDisposerRef.current?.();
      exitDisposerRef.current?.();
      errorDisposerRef.current?.();
      resizeDisposerRef.current?.();

      dataDisposerRef.current = null;
      exitDisposerRef.current = null;
      errorDisposerRef.current = null;
      resizeDisposerRef.current = null;

      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;

      sessionIdRef.current = null;

      if (killProcess && sessionId && window.desktopBridge?.terminal) {
        try {
          setIsDisposing(true);
          await window.desktopBridge.terminal.dispose(sessionId);
        } catch (disposeError) {
          console.error("Failed to dispose terminal session", disposeError);
        } finally {
          setIsDisposing(false);
        }
      }
    },
    []
  );

  const handleDisconnect = useCallback(() => {
    void cleanupSession(true);
    setStatus("closed");
  }, [cleanupSession]);

  const handleConnect = useCallback(async () => {
    if (!containerRef.current) {
      return;
    }

    if (!window.desktopBridge?.terminal) {
      setError(dictionary.desktopOnlyHint);
      setStatus("error");
      return;
    }

    if (!host) {
      setError(dictionary.requireIp);
      setStatus("error");
      return;
    }

    if (sessionIdRef.current) {
      return;
    }

    setStatus("connecting");
    setError(null);

    const [{ Terminal }, { FitAddon }] = await Promise.all([
      import("@xterm/xterm"),
      import("@xterm/addon-fit"),
    ]);

    const terminal = new Terminal({
      convertEol: true,
      fontFamily: "var(--font-geist-mono, monospace)",
      fontSize: 13,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 1000,
      theme: {
        background: getComputedStyle(document.documentElement).getPropertyValue("--card")?.trim() || "#111827",
        foreground: getComputedStyle(document.documentElement).getPropertyValue("--foreground")?.trim() || "#f9fafb",
        cursor: getComputedStyle(document.documentElement).getPropertyValue("--primary")?.trim() || "#38bdf8",
      },
    });

  const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.open(containerRef.current);
    fitAddon.fit();

    const resizeListener = () => {
      window.requestAnimationFrame(() => {
        fitAddon.fit();
        if (sessionIdRef.current && window.desktopBridge?.terminal) {
          window.desktopBridge.terminal.resize(sessionIdRef.current, {
            cols: terminal.cols,
            rows: terminal.rows,
          });
        }
      });
    };

    window.addEventListener("resize", resizeListener);
    resizeDisposerRef.current = () => window.removeEventListener("resize", resizeListener);

    try {
      const { id } = await window.desktopBridge.terminal.createTelnetSession({
        host,
        port,
        dimensions: { cols: terminal.cols, rows: terminal.rows },
      });

      sessionIdRef.current = id;

      dataDisposerRef.current = window.desktopBridge.terminal.onData(({ id: incomingId, data }) => {
        if (incomingId === id) {
          terminal.write(data);
        }
      });

      exitDisposerRef.current = window.desktopBridge.terminal.onExit(({ id: exitingId }) => {
        if (exitingId !== id) {
          return;
        }
        void cleanupSession(false);
        setStatus("closed");
      });

      errorDisposerRef.current = window.desktopBridge.terminal.onError(({ id: erroredId, message }) => {
        if (erroredId !== id) {
          return;
        }
        setError(message ?? dictionary.status.error);
        setStatus("error");
        void cleanupSession(false);
      });

      terminal.onData((data: string) => {
        if (sessionIdRef.current) {
          window.desktopBridge?.terminal.write(sessionIdRef.current, data);
        }
      });

      terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (sessionIdRef.current) {
          window.desktopBridge?.terminal.resize(sessionIdRef.current, { cols, rows });
        }
      });

      setStatus("connected");
      setError(null);
    } catch (connectError) {
      console.error("Failed to establish Telnet session", connectError);
      setError(
        connectError instanceof Error ? connectError.message : dictionary.status.error
      );
      setStatus("error");
      await cleanupSession(true);
    }
  }, [cleanupSession, dictionary.desktopOnlyHint, dictionary.requireIp, dictionary.status.error, host, port]);

  useEffect(() => {
    return () => {
      void cleanupSession(true);
    };
  }, [cleanupSession]);

  const actionButtonLabel = useMemo(() => {
    if (status === "connecting") {
      return dictionary.connectingButton;
    }
    if (status === "connected") {
      return dictionary.closeButton;
    }
    return dictionary.openButton;
  }, [dictionary.closeButton, dictionary.connectingButton, dictionary.openButton, status]);

  const isActionDisabled = useMemo(() => {
    if (status === "connecting" || isDisposing) {
      return true;
    }
    if (status === "connected") {
      return false;
    }
    return !isDesktopAvailable;
  }, [isDesktopAvailable, isDisposing, status]);

  const handleActionClick = () => {
    if (status === "connected") {
      handleDisconnect();
      return;
    }
    void handleConnect();
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleActionClick} disabled={isActionDisabled} variant={status === "connected" ? "secondary" : "default"}>
            {actionButtonLabel}
          </Button>
          <span className="text-xs text-muted-foreground">{statusLabel}</span>
        </div>
        {!isDesktopAvailable && (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            {dictionary.desktopOnlyHint}
          </p>
        )}
        {status !== "connected" && host === "" && (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            {dictionary.requireIp}
          </p>
        )}
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <Separator className="bg-border/60" />
      <div
        ref={containerRef}
        className="h-[360px] w-full overflow-hidden rounded-lg border border-border bg-card/90 shadow-inner"
      />
    </div>
  );
}
