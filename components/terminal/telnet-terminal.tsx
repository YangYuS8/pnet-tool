"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Terminal as XtermTerminal } from "@xterm/xterm";
import type { FitAddon as FitAddonClass } from "@xterm/addon-fit";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { HomeDictionary } from "@/lib/i18n/dictionaries";

export type TerminalStatus = "idle" | "connecting" | "connected" | "closed" | "error";

export type TerminalMode = "create" | "attach";

export type TerminalStatusChange = {
  status: TerminalStatus;
  error?: string | null;
};

export type TelnetTerminalProps = {
  host: string;
  port: number;
  dictionary: HomeDictionary["terminal"];
  autoConnectSignal?: number;
  onStatusChange?: (payload: TerminalStatusChange) => void;
  onSessionCreated?: (sessionId: string) => void;
  sessionId?: string;
  mode?: TerminalMode;
  isVisible?: boolean;
  disposeOnUnmount?: boolean;
  showControls?: boolean;
};

type CleanupDisposer = (() => void) | null;

export function TelnetTerminal({
  host,
  port,
  dictionary,
  autoConnectSignal,
  onStatusChange,
  onSessionCreated,
  sessionId,
  mode = "create",
  isVisible = true,
  disposeOnUnmount = true,
  showControls = true,
}: TelnetTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XtermTerminal | null>(null);
  const fitAddonRef = useRef<FitAddonClass | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const dataDisposerRef = useRef<CleanupDisposer>(null);
  const exitDisposerRef = useRef<CleanupDisposer>(null);
  const errorDisposerRef = useRef<CleanupDisposer>(null);
  const resizeDisposerRef = useRef<CleanupDisposer>(null);
  const autoConnectTokenRef = useRef<number | undefined>(undefined);
  const disposeOnUnmountRef = useRef<boolean>(disposeOnUnmount);
  const previousVisibilityRef = useRef<boolean>(isVisible);

  const [status, setStatus] = useState<TerminalStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isDesktopAvailable, setDesktopAvailable] = useState(false);
  const [isDisposing, setIsDisposing] = useState(false);

  useEffect(() => {
    setDesktopAvailable(typeof window !== "undefined" && Boolean(window.desktopBridge?.terminal));
  }, []);

  useEffect(() => {
    disposeOnUnmountRef.current = disposeOnUnmount;
  }, [disposeOnUnmount]);

  useEffect(() => {
    if (mode === "attach" && sessionId) {
      sessionIdRef.current = sessionId;
    }
  }, [mode, sessionId]);

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

  const subscribeSessionStreams = useCallback(
    (id: string, terminal: XtermTerminal) => {
      dataDisposerRef.current = window.desktopBridge?.terminal.onData(({ id: incomingId, data }) => {
        if (incomingId === id) {
          terminal.write(data);
        }
      }) ?? null;

      exitDisposerRef.current = window.desktopBridge?.terminal.onExit(({ id: exitingId }) => {
        if (exitingId !== id) {
          return;
        }
        void cleanupSession(false);
        setStatus("closed");
      }) ?? null;

      errorDisposerRef.current = window.desktopBridge?.terminal.onError(({ id: erroredId, message }) => {
        if (erroredId !== id) {
          return;
        }
        setError(message ?? dictionary.status.error);
        setStatus("error");
        void cleanupSession(false);
      }) ?? null;
    },
    [cleanupSession, dictionary.status.error]
  );

  const handleConnect = useCallback(async () => {
    if (!containerRef.current) {
      return;
    }

    if (!window.desktopBridge?.terminal) {
      setError(dictionary.desktopOnlyHint);
      setStatus("error");
      return;
    }

    if (mode === "create" && !host) {
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

    const dimensions = { cols: terminal.cols, rows: terminal.rows } as const;

    try {
      let resolvedSessionId = sessionIdRef.current;

      if (mode === "attach" && sessionId) {
        await window.desktopBridge.terminal.attach({ id: sessionId, dimensions });
        resolvedSessionId = sessionId;
      } else {
        const { id } = await window.desktopBridge.terminal.createTelnetSession({
          host,
          port,
          dimensions,
        });
        resolvedSessionId = id;
      }

      if (!resolvedSessionId) {
        throw new Error("Unable to determine terminal session ID");
      }

      sessionIdRef.current = resolvedSessionId;
      subscribeSessionStreams(resolvedSessionId, terminal);

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

      onSessionCreated?.(resolvedSessionId);
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
  }, [cleanupSession, dictionary.desktopOnlyHint, dictionary.requireIp, dictionary.status.error, host, mode, onSessionCreated, port, sessionId, subscribeSessionStreams]);

  useEffect(() => {
    if (mode === "attach" && sessionId && status === "idle") {
      void handleConnect();
    }
  }, [handleConnect, mode, sessionId, status]);

  useEffect(() => {
    onStatusChange?.({ status, error });
  }, [status, error, onStatusChange]);

  useEffect(() => {
    if (autoConnectSignal === undefined) {
      autoConnectTokenRef.current = undefined;
      return;
    }
    if (autoConnectTokenRef.current === autoConnectSignal) {
      return;
    }
    autoConnectTokenRef.current = autoConnectSignal;
    const initiate = async () => {
      if (status === "connecting") {
        return;
      }
      if (status === "connected" && mode === "create") {
        await cleanupSession(true);
        setStatus("closed");
      }
      await handleConnect();
    };
    void initiate();
  }, [autoConnectSignal, cleanupSession, handleConnect, mode, status]);

  useEffect(() => {
    return () => {
      void cleanupSession(disposeOnUnmountRef.current);
    };
  }, [cleanupSession]);

  useEffect(() => {
    if (isVisible && !previousVisibilityRef.current) {
      window.requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
        if (sessionIdRef.current && terminalRef.current) {
          window.desktopBridge?.terminal.resize(sessionIdRef.current, {
            cols: terminalRef.current.cols,
            rows: terminalRef.current.rows,
          });
        }
      });
    }
    previousVisibilityRef.current = isVisible;
  }, [isVisible]);

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
          {showControls ? (
            <>
              <Button
                onClick={handleActionClick}
                disabled={isActionDisabled}
                variant={status === "connected" ? "secondary" : "default"}
              >
                {actionButtonLabel}
              </Button>
              <span className="text-xs text-muted-foreground">{statusLabel}</span>
            </>
          ) : (
            <span className="text-xs font-medium text-muted-foreground">{statusLabel}</span>
          )}
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
  {showControls && <Separator className="bg-border/60" />}
      <div
        ref={containerRef}
        className="h-[360px] w-full overflow-hidden rounded-lg border border-border bg-card/90 shadow-inner"
      />
    </div>
  );
}
