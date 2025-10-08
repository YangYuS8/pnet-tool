"use client";

import type { DragEvent } from "react";
import { Fragment, useCallback, useRef } from "react";
import { Circle, SquareArrowOutUpRight, X } from "lucide-react";

import type { HomeDictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";

import type { TerminalStatus } from "@/components/terminal/telnet-terminal";

const TAB_DRAG_TYPE = "application/x-pnet-tab";
const SESSION_DRAG_TYPE = "application/x-pnet-session";

type SessionTabDescriptor = {
  key: string;
  host: string;
  port: number;
  label?: string;
  status: TerminalStatus;
  isActive: boolean;
  isDetaching?: boolean;
};

type MergeDetachedPayload = {
  sessionId: string;
  host?: string;
  port?: number;
  label?: string;
};

type SessionTabsProps = {
  sessions: SessionTabDescriptor[];
  dictionary: HomeDictionary["terminal"];
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
  onDetach: (key: string) => void;
  onReorder?: (sourceKey: string, targetKey: string | null) => void;
  onMergeDetachedSession?: (payload: MergeDetachedPayload) => void;
};

const statusTone: Record<TerminalStatus, string> = {
  idle: "text-muted-foreground",
  connecting: "text-amber-500",
  connected: "text-emerald-500",
  closed: "text-muted-foreground",
  error: "text-destructive",
};

function hasDragType(event: DragEvent<HTMLElement>, type: string) {
  return Array.from(event.dataTransfer?.types ?? []).includes(type);
}

function parseTabPayload(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { key?: string } | undefined;
    if (parsed && typeof parsed.key === "string" && parsed.key.trim().length > 0) {
      return parsed.key.trim();
    }
  } catch {
      // fallback to plain text format
  }
  const fallback = raw.trim();
  return fallback.length > 0 ? fallback : null;
}

function parseSessionPayload(raw: string | null | undefined): MergeDetachedPayload | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as MergeDetachedPayload;
    if (parsed && typeof parsed.sessionId === "string" && parsed.sessionId.trim().length > 0) {
      return {
        sessionId: parsed.sessionId.trim(),
        host: parsed.host,
        port: typeof parsed.port === "number" && Number.isFinite(parsed.port) ? parsed.port : undefined,
        label: parsed.label,
      } satisfies MergeDetachedPayload;
    }
  } catch {
      // invalid payloads are ignored
  }
  return null;
}

export function SessionTabs({
  sessions,
  dictionary,
  onSelect,
  onClose,
  onDetach,
  onReorder,
  onMergeDetachedSession,
}: SessionTabsProps) {
  const draggingKeyRef = useRef<string | null>(null);
  const dropHandledRef = useRef(false);

  const handleDragStart = useCallback(
    (key: string) => (event: DragEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      draggingKeyRef.current = key;
      dropHandledRef.current = false;
      event.stopPropagation();
      event.dataTransfer.effectAllowed = "move";
      const payload = JSON.stringify({ key });
      event.dataTransfer.setData(TAB_DRAG_TYPE, payload);
      event.dataTransfer.setData("text/plain", key);
    },
    []
  );

  const handleDragOverTab = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!hasDragType(event, TAB_DRAG_TYPE) && !hasDragType(event, SESSION_DRAG_TYPE)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDropOnTab = useCallback(
    (targetKey: string) => (event: DragEvent<HTMLDivElement>) => {
      const { dataTransfer } = event;
      if (!dataTransfer) {
        return;
      }

      const sessionPayload = parseSessionPayload(dataTransfer.getData(SESSION_DRAG_TYPE));
      if (sessionPayload) {
        event.preventDefault();
        dropHandledRef.current = true;
        onMergeDetachedSession?.(sessionPayload);
        return;
      }

      const sourceKey =
        parseTabPayload(dataTransfer.getData(TAB_DRAG_TYPE)) ??
        parseTabPayload(dataTransfer.getData("text/plain")) ??
        draggingKeyRef.current;

      if (!sourceKey) {
        return;
      }

      event.preventDefault();
      dropHandledRef.current = true;

      if (sourceKey === targetKey) {
        return;
      }

      onReorder?.(sourceKey, targetKey);
    },
    [onMergeDetachedSession, onReorder]
  );

  const handleContainerDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!hasDragType(event, TAB_DRAG_TYPE) && !hasDragType(event, SESSION_DRAG_TYPE)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleContainerDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const { dataTransfer } = event;
      if (!dataTransfer) {
        return;
      }

      const sessionPayload = parseSessionPayload(dataTransfer.getData(SESSION_DRAG_TYPE));
      if (sessionPayload) {
        event.preventDefault();
        dropHandledRef.current = true;
        onMergeDetachedSession?.(sessionPayload);
        return;
      }

      const sourceKey =
        parseTabPayload(dataTransfer.getData(TAB_DRAG_TYPE)) ??
        parseTabPayload(dataTransfer.getData("text/plain")) ??
        draggingKeyRef.current;

      if (!sourceKey) {
        return;
      }

      event.preventDefault();
      dropHandledRef.current = true;
      onReorder?.(sourceKey, null);
    },
    [onMergeDetachedSession, onReorder]
  );

  const handleDragEnd = useCallback(
    (key: string) => () => {
      const shouldDetach = draggingKeyRef.current === key && !dropHandledRef.current;
      draggingKeyRef.current = null;
      dropHandledRef.current = false;
      if (shouldDetach) {
        onDetach(key);
      }
    },
    [onDetach]
  );

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/10 p-8 text-center text-sm text-muted-foreground">
        <p className="text-base font-semibold text-foreground/80">
          {dictionary.sessionTabs.emptyTitle}
        </p>
        <p className="max-w-[380px] text-xs text-muted-foreground">
          {dictionary.sessionTabs.emptyDescription}
        </p>
      </div>
    );
  }

  return (
    <Fragment>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
          {dictionary.sessionTabs.headerLabel}
        </p>
        <p className="text-xs text-muted-foreground/80">{sessions.length}</p>
      </div>
      <div
        className="flex items-center gap-2 overflow-x-auto pb-1"
        onDragOver={handleContainerDragOver}
        onDrop={handleContainerDrop}
      >
        {sessions.map((session) => {
          const isActive = session.isActive;
          const isDetaching = Boolean(session.isDetaching);
          const statusLabel = dictionary.status[session.status];
          const primaryLabel = session.label?.trim().length
            ? session.label
            : session.host || dictionary.sessionTabs.emptyTitle;
          const hostDisplay = session.host
            ? session.port
              ? `${session.host}:${session.port}`
              : session.host
            : undefined;
          return (
            <div
              key={session.key}
              className={cn(
                "group flex min-w-[220px] cursor-grab items-center rounded-lg border px-2 py-2 text-left shadow-sm transition active:cursor-grabbing",
                isActive
                  ? "border-border bg-background/90"
                  : "border-border/60 bg-muted/50 hover:bg-muted/70",
                isDetaching && "cursor-not-allowed opacity-60"
              )}
              draggable={!isDetaching}
              onDragStart={handleDragStart(session.key)}
              onDragOver={handleDragOverTab}
              onDrop={handleDropOnTab(session.key)}
              onDragEnd={handleDragEnd(session.key)}
              role="listitem"
            >
              <button
                type="button"
                className="flex flex-1 flex-col gap-1 text-left"
                onClick={() => onSelect(session.key)}
                disabled={isActive || isDetaching}
              >
                <span className="truncate text-sm font-semibold text-foreground/90" title={primaryLabel}>
                  {primaryLabel}
                </span>
                {hostDisplay && (
                  <span className="truncate text-[11px] text-muted-foreground" title={hostDisplay}>
                    {hostDisplay}
                  </span>
                )}
                <span className={cn("flex items-center gap-1 text-[11px]", statusTone[session.status])}>
                  <Circle className="h-[7px] w-[7px] fill-current" />
                  {statusLabel}
                </span>
              </button>
              <div className="ml-2 flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => onDetach(session.key)}
                  disabled={isDetaching}
                  title={dictionary.sessionTabs.detachAction}
                  draggable={false}
                >
                  <SquareArrowOutUpRight className="h-4 w-4" />
                  <span className="sr-only">{dictionary.sessionTabs.detachAction}</span>
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => onClose(session.key)}
                  disabled={isDetaching}
                  title={dictionary.sessionTabs.closeAction}
                  draggable={false}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">{dictionary.sessionTabs.closeAction}</span>
                </Button>
              </div>
            </div>
          );
        })}
        <div className="h-11 w-4 flex-shrink-0" aria-hidden />
      </div>
    </Fragment>
  );
}
