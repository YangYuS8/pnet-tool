"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ITheme, Terminal as XtermTerminal } from "@xterm/xterm";
import type { FitAddon as FitAddonClass } from "@xterm/addon-fit";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useTerminalSettings } from "@/components/terminal/terminal-settings-provider";
import type { HomeDictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

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
  label?: string;
  className?: string;
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
  label,
  className,
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
  const hasHydratedBufferRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const statusChangeHandlerRef = useRef<typeof onStatusChange>(onStatusChange);

  const [status, setStatus] = useState<TerminalStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isDesktopAvailable, setDesktopAvailable] = useState(false);
  const [isDisposing, setIsDisposing] = useState(false);
  const { resolvedTheme } = useTheme();
  const { settings: terminalSettings, resolvedFontFamily } = useTerminalSettings();

  const lightTheme = useMemo<ITheme>(
    () => ({
      background: "#f9fafb",
      foreground: "#111827",
      cursor: "#2563eb",
      selection: "rgba(37, 99, 235, 0.25)",
      black: "#1f2937",
      red: "#dc2626",
      green: "#16a34a",
      yellow: "#ca8a04",
      blue: "#2563eb",
      magenta: "#7c3aed",
      cyan: "#0891b2",
      white: "#f3f4f6",
      brightBlack: "#4b5563",
      brightRed: "#ef4444",
      brightGreen: "#22c55e",
      brightYellow: "#eab308",
      brightBlue: "#3b82f6",
      brightMagenta: "#8b5cf6",
      brightCyan: "#06b6d4",
      brightWhite: "#ffffff",
    }),
    []
  );

  const darkTheme = useMemo<ITheme>(
    () => ({
      background: "#0f1115",
      foreground: "#f7fafc",
      cursor: "#38bdf8",
      selection: "rgba(56, 189, 248, 0.35)",
      black: "#111827",
      red: "#f87171",
      green: "#34d399",
      yellow: "#facc15",
      blue: "#60a5fa",
      magenta: "#c084fc",
      cyan: "#5eead4",
      white: "#e5e7eb",
      brightBlack: "#1f2937",
      brightRed: "#f97316",
      brightGreen: "#4ade80",
      brightYellow: "#fde047",
      brightBlue: "#93c5fd",
      brightMagenta: "#e879f9",
      brightCyan: "#67e8f9",
      brightWhite: "#ffffff",
    }),
    []
  );

  const activeTheme = useMemo(() => (resolvedTheme === "dark" ? darkTheme : lightTheme), [darkTheme, lightTheme, resolvedTheme]);

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
      hasHydratedBufferRef.current = false;

  if (killProcess && sessionId && window.desktopBridge?.terminal) {
        try {
          setIsDisposing(true);
          await window.desktopBridge!.terminal.dispose(sessionId);
        } catch (disposeError) {
          console.error("Failed to dispose terminal session", disposeError);
        } finally {
          setIsDisposing(false);
        }
      }
    },
    []
  );

  const scheduleFit = useCallback(
    (options: { scrollToBottom?: boolean } = {}) => {
      const shouldScroll = options.scrollToBottom ?? true;
      if (!terminalRef.current || !fitAddonRef.current) {
        return;
      }
      const terminal = terminalRef.current;
      const fitAddon = fitAddonRef.current;
      window.requestAnimationFrame(() => {
        fitAddon.fit();
        if (shouldScroll) {
          terminal.scrollToBottom();
        }
        if (sessionIdRef.current && window.desktopBridge?.terminal) {
          window.desktopBridge!.terminal.resize(sessionIdRef.current, {
            cols: terminal.cols,
            rows: terminal.rows,
          });
        }
      });
    },
    [],
  );

  const handleDisconnect = useCallback(() => {
    void cleanupSession(true);
    setStatus("closed");
  }, [cleanupSession]);

  const subscribeSessionStreams = useCallback(
    (id: string, terminal: XtermTerminal) => {
  dataDisposerRef.current = window.desktopBridge?.terminal.onData(({ id: incomingId, data }: { id: string; data: string }) => {
        if (incomingId === id) {
          terminal.write(data);
        }
      }) ?? null;

  exitDisposerRef.current = window.desktopBridge?.terminal.onExit(({ id: exitingId }: { id: string }) => {
        if (exitingId !== id) {
          return;
        }
        void cleanupSession(false);
        setStatus("closed");
      }) ?? null;

  errorDisposerRef.current = window.desktopBridge?.terminal.onError(({ id: erroredId, message }: { id: string; message: string }) => {
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
    hasHydratedBufferRef.current = false;

    const [{ Terminal }, { FitAddon }] = await Promise.all([
      import("@xterm/xterm"),
      import("@xterm/addon-fit"),
    ]);

    const terminal = new Terminal({
      convertEol: true,
      fontFamily: resolvedFontFamily,
      fontSize: terminalSettings.fontSize,
      lineHeight: terminalSettings.lineHeight,
      letterSpacing: terminalSettings.letterSpacing,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 1000,
      theme: activeTheme,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.open(containerRef.current);
    scheduleFit({ scrollToBottom: false });

    const resizeListener = () => {
      scheduleFit();
    };

    window.addEventListener("resize", resizeListener);
    resizeDisposerRef.current = () => window.removeEventListener("resize", resizeListener);

    const container = containerRef.current;
    resizeObserverRef.current?.disconnect();
    if (container) {
      const observer = new ResizeObserver(() => {
        scheduleFit();
      });
      observer.observe(container);
      resizeObserverRef.current = observer;
    }

    const dimensions = { cols: terminal.cols, rows: terminal.rows } as const;

    try {
      let resolvedSessionId = sessionIdRef.current;

      if (mode === "attach" && sessionId) {
        resolvedSessionId = sessionId;
        sessionIdRef.current = sessionId;
  const attached = await window.desktopBridge!.terminal.attach({ id: sessionId, dimensions });
        if (!attached) {
          throw new Error(`Unable to attach to existing session ${sessionId}`);
        }
      } else {
        const { id } = await window.desktopBridge!.terminal.createTelnetSession({
          host,
          port,
          label,
          dimensions,
        });
        resolvedSessionId = id;
      }

      if (!resolvedSessionId) {
        throw new Error("Unable to determine terminal session ID");
      }

      sessionIdRef.current = resolvedSessionId;
      subscribeSessionStreams(resolvedSessionId, terminal);

      const hydrateBuffer = async () => {
        if (hasHydratedBufferRef.current) {
          return;
        }
  const readBuffer = window.desktopBridge?.terminal?.readBuffer;
        if (!readBuffer) {
          hasHydratedBufferRef.current = true;
          return;
        }
        try {
          const snapshot = await readBuffer(resolvedSessionId);
          if (snapshot) {
            terminal.write(snapshot);
            terminal.scrollToBottom();
          }
        } catch (hydrateError) {
          console.warn("Failed to hydrate terminal buffer", hydrateError);
        } finally {
          hasHydratedBufferRef.current = true;
        }
      };

      void hydrateBuffer();

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
  }, [
    activeTheme,
    cleanupSession,
    dictionary.desktopOnlyHint,
    dictionary.requireIp,
    dictionary.status.error,
    host,
    label,
    mode,
    onSessionCreated,
    port,
    scheduleFit,
    sessionId,
    subscribeSessionStreams,
    resolvedFontFamily,
    terminalSettings.fontSize,
    terminalSettings.lineHeight,
    terminalSettings.letterSpacing,
  ]);

  useEffect(() => {
    if (mode === "attach" && sessionId && status === "idle") {
      void handleConnect();
    }
  }, [handleConnect, mode, sessionId, status]);

  useEffect(() => {
    statusChangeHandlerRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    statusChangeHandlerRef.current?.({ status, error });
  }, [status, error]);

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
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, [cleanupSession]);

  useEffect(() => {
    if (!terminalRef.current) {
      return;
    }
    terminalRef.current.options.theme = activeTheme;
    terminalRef.current.refresh(0, terminalRef.current.rows - 1);
    scheduleFit();
  }, [activeTheme, scheduleFit]);

  useEffect(() => {
    if (!terminalRef.current) {
      return;
    }
    terminalRef.current.options.fontFamily = resolvedFontFamily;
    terminalRef.current.options.fontSize = terminalSettings.fontSize;
    terminalRef.current.options.lineHeight = terminalSettings.lineHeight;
    terminalRef.current.options.letterSpacing = terminalSettings.letterSpacing;
    scheduleFit();
  }, [resolvedFontFamily, scheduleFit, terminalSettings.fontFamily, terminalSettings.fontSize, terminalSettings.letterSpacing, terminalSettings.lineHeight]);

  useEffect(() => {
    if (isVisible && !previousVisibilityRef.current) {
      scheduleFit();
    }
    previousVisibilityRef.current = isVisible;
  }, [isVisible, scheduleFit]);

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
    <div className={cn("flex w-full flex-1 flex-col gap-4", className)}>
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
        className="flex-1 min-h-[360px] w-full overflow-hidden rounded-lg border border-border bg-card/90 shadow-inner"
      />
    </div>
  );
}
