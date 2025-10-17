"use client";

import type { DragEvent } from "react";
import { Fragment, useCallback, useRef } from "react";
import { Circle, X } from "lucide-react";

import type { HomeDictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";

import type { TerminalStatus } from "@/components/terminal/telnet-terminal";

const TAB_DRAG_TYPE = "application/x-pnet-session-order";

type SessionTabDescriptor = {
  key: string;
  host: string;
  port: number;
  label?: string;
  status: TerminalStatus;
  isActive: boolean;
};

type SessionTabsProps = {
  sessions: SessionTabDescriptor[];
  dictionary: HomeDictionary["terminal"];
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
  onReorder?: (sourceKey: string, targetKey: string | null) => void;
};

const statusTone: Record<TerminalStatus, string> = {
  idle: "text-muted-foreground",
  connecting: "text-amber-500",
  connected: "text-emerald-500",
  closed: "text-muted-foreground",
  error: "text-destructive",
};

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

export function SessionTabs({
  sessions,
  dictionary,
  onSelect,
  onClose,
  onReorder,
}: SessionTabsProps) {
  const draggingKeyRef = useRef<string | null>(null);

  const handleDragStart = useCallback(
    (key: string) => (event: DragEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !event.dataTransfer || !onReorder) {
        return;
      }
      draggingKeyRef.current = key;
      event.stopPropagation();
      event.dataTransfer.effectAllowed = "move";
      const payload = JSON.stringify({ key });
      event.dataTransfer.setData(TAB_DRAG_TYPE, payload);
      event.dataTransfer.setData("text/plain", key);
    },
    [onReorder]
  );

  const handleDragOverItem = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!onReorder || !event.dataTransfer) {
        return;
      }
      const types = Array.from(event.dataTransfer.types ?? []);
      if (!types.includes(TAB_DRAG_TYPE)) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    },
    [onReorder]
  );

  const handleDropOnItem = useCallback(
    (targetKey: string) => (event: DragEvent<HTMLDivElement>) => {
      if (!onReorder || !event.dataTransfer) {
        return;
      }

      const sourceKey =
        parseTabPayload(event.dataTransfer.getData(TAB_DRAG_TYPE)) ??
        parseTabPayload(event.dataTransfer.getData("text/plain")) ??
        draggingKeyRef.current;

      if (!sourceKey || sourceKey === targetKey) {
        return;
      }

      event.preventDefault();
      onReorder(sourceKey, targetKey);
    },
    [onReorder]
  );

  const handleContainerDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!onReorder || !event.dataTransfer) {
        return;
      }
      const types = Array.from(event.dataTransfer.types ?? []);
      if (!types.includes(TAB_DRAG_TYPE)) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    },
    [onReorder]
  );

  const handleContainerDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!onReorder || !event.dataTransfer) {
        return;
      }

      const sourceKey =
        parseTabPayload(event.dataTransfer.getData(TAB_DRAG_TYPE)) ??
        parseTabPayload(event.dataTransfer.getData("text/plain")) ??
        draggingKeyRef.current;

      if (!sourceKey) {
        return;
      }

      event.preventDefault();
      onReorder(sourceKey, null);
    },
    [onReorder]
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
      <div className="flex shrink-0 items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
          {dictionary.sessionTabs.headerLabel}
        </p>
        <p className="text-xs text-muted-foreground/80">{sessions.length}</p>
      </div>
      {onReorder ? (
        <p className="shrink-0 text-[11px] text-muted-foreground/70">{dictionary.sessionTabs.reorderHint}</p>
      ) : null}
      <div
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1"
        onDragOver={handleContainerDragOver}
        onDrop={handleContainerDrop}
        role="list"
      >
        {sessions.map((session) => {
          const isActive = session.isActive;
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
                "group flex w-full cursor-grab items-center rounded-lg border px-3 py-3 text-left shadow-sm transition active:cursor-grabbing",
                isActive
                  ? "border-primary/40 bg-primary/5"
                  : "border-border/60 bg-muted/40 hover:bg-muted/60",
                !onReorder && "cursor-default"
              )}
              draggable={Boolean(onReorder)}
              onDragStart={handleDragStart(session.key)}
              onDragOver={handleDragOverItem}
              onDrop={handleDropOnItem(session.key)}
              role="listitem"
            >
              <button
                type="button"
                className="flex flex-1 flex-col gap-1 text-left"
                onClick={() => onSelect(session.key)}
                disabled={isActive}
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
                  onClick={() => onClose(session.key)}
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
      </div>
    </Fragment>
  );
}
