"use client";

import { Minus, Square, Copy, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

type WindowStatePayload = {
  isMaximized: boolean;
  isFullScreen: boolean;
  isFocused: boolean;
};

type DesktopWindowChromeProps = {
  children: ReactNode;
};

function isDesktopAvailable() {
  return typeof window !== "undefined" && Boolean(window.desktopBridge?.window);
}

const DRAG_REGION_STYLE = { WebkitAppRegion: "drag" } as CSSProperties;
const NO_DRAG_REGION_STYLE = { WebkitAppRegion: "no-drag" } as CSSProperties;

export function DesktopWindowChrome({ children }: DesktopWindowChromeProps) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [windowState, setWindowState] = useState<WindowStatePayload>({
    isMaximized: false,
    isFullScreen: false,
    isFocused: true,
  });

  useEffect(() => {
    if (!isDesktopAvailable()) {
      return;
    }
    setIsDesktop(true);

    const updateState = (payload: WindowStatePayload) => {
      setWindowState(payload);
    };

    void window.desktopBridge.window
      ?.getState()
      .then(updateState)
      .catch(() => {
        /* swallow */
      });

    const unsubscribe = window.desktopBridge.window?.onStateChange(updateState);
    return () => {
      unsubscribe?.();
    };
  }, []);

  const isMaximized = useMemo(
    () => windowState.isMaximized || windowState.isFullScreen,
    [windowState.isFullScreen, windowState.isMaximized]
  );

  const handleMinimize = useCallback(() => {
    window.desktopBridge.window?.minimize();
  }, []);

  const handleToggleMaximize = useCallback(async () => {
    try {
      const nextState = await window.desktopBridge.window?.toggleMaximize();
      if (nextState) {
        setWindowState(nextState);
      }
    } catch (error) {
      console.error("Failed to toggle maximize", error);
    }
  }, []);

  const handleClose = useCallback(() => {
    window.desktopBridge.window?.close();
  }, []);

  if (!isDesktop) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-full min-h-screen w-full flex-col overflow-hidden bg-[radial-gradient(circle_at_8%_16%,rgba(18,21,26,0.94),rgba(9,11,14,0.98))] text-foreground">
      <div className="flex h-full w-full flex-col overflow-hidden bg-background/94 backdrop-blur-xl">
        <header
          className={cn(
            "flex h-12 items-center justify-between border-b border-border/40 px-4 text-xs transition",
            windowState.isFocused ? "bg-background/80" : "bg-background/60 opacity-85"
          )}
          style={DRAG_REGION_STYLE}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em]",
                "bg-primary/10 text-primary"
              )}
              style={NO_DRAG_REGION_STYLE}
            >
              PNET Tool
            </div>
            <span className="hidden text-[11px] text-muted-foreground/75 md:inline">
              Telnet Orchestrator for PNETLab
            </span>
          </div>
          <div className="flex items-center gap-1" style={NO_DRAG_REGION_STYLE}>
            <WindowControlButton label="Minimize" onClick={handleMinimize}>
              <Minus className="h-3.5 w-3.5" />
            </WindowControlButton>
            <WindowControlButton label={isMaximized ? "Restore" : "Maximize"} onClick={handleToggleMaximize}>
              {isMaximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            </WindowControlButton>
            <WindowControlButton label="Close" intent="danger" onClick={handleClose}>
              <X className="h-3.5 w-3.5" />
            </WindowControlButton>
          </div>
        </header>
        <div className="flex flex-1 flex-col overflow-hidden bg-background/95">
          {children}
        </div>
      </div>
    </div>
  );
}

type WindowControlButtonProps = {
  onClick: () => void;
  label: string;
  intent?: "default" | "danger";
  children: ReactNode;
};

function WindowControlButton({ onClick, label, intent = "default", children }: WindowControlButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg border text-foreground/80 transition",
        "border-border/40 bg-background/80 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
        intent === "danger" && "hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/60"
      )}
    >
      {children}
    </button>
  );
}
