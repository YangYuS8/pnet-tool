"use client";

import { Fragment } from "react";
import { Circle, SquareArrowOutUpRight, X } from "lucide-react";

import type { HomeDictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";

import type { TerminalStatus } from "@/components/terminal/telnet-terminal";

type SessionTabDescriptor = {
  key: string;
  host: string;
  port: number;
  label?: string;
  status: TerminalStatus;
  isActive: boolean;
  isDetaching?: boolean;
};

type SessionTabsProps = {
  sessions: SessionTabDescriptor[];
  dictionary: HomeDictionary["terminal"];
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
  onDetach: (key: string) => void;
};

const statusTone: Record<TerminalStatus, string> = {
  idle: "text-muted-foreground",
  connecting: "text-amber-500",
  connected: "text-emerald-500",
  closed: "text-muted-foreground",
  error: "text-destructive",
};

export function SessionTabs({ sessions, dictionary, onSelect, onClose, onDetach }: SessionTabsProps) {
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
        <p className="text-xs text-muted-foreground/80">
          {sessions.length}
        </p>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
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
                "group flex min-w-[220px] items-center rounded-lg border px-2 py-2 text-left shadow-sm transition",
                isActive
                  ? "border-border bg-background/90"
                  : "border-border/60 bg-muted/50 hover:bg-muted/70",
                isDetaching && "opacity-60"
              )}
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
