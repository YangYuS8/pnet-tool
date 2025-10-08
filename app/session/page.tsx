"use client";

import { Loader2 } from "lucide-react";

import { DesktopWindowChrome } from "@/components/desktop/window-chrome";
import { home as zhCNHome } from "@/locales/zh-CN";

const terminalDictionary = zhCNHome.terminal;

export default function SessionPage() {
  return (
    <DesktopWindowChrome>
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background px-6 py-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm font-medium text-foreground">
            {terminalDictionary.sessionTabs.headerLabel}
          </span>
        </div>
        <div className="space-y-2 text-center">
          <p className="text-base font-semibold text-foreground">
            {terminalDictionary.sessionTabs.emptyTitle}
          </p>
          <p>{terminalDictionary.sessionTabs.emptyDescription}</p>
          <p className="text-xs text-muted-foreground/80">
            {terminalDictionary.desktopOnlyHint}
          </p>
          <p className="text-xs text-muted-foreground/80">
            {terminalDictionary.sessionTabs.reorderHint}
          </p>
        </div>
      </div>
    </DesktopWindowChrome>
  );
}
