"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { useLocaleContext, useLocaleDictionary } from "@/components/locale/locale-provider";
import { useTerminalSettings } from "@/components/terminal/terminal-settings-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n/config";

export function SettingsPage() {
  const { dictionary } = useLocaleDictionary("settings");
  const { locale, setLocale, isChanging } = useLocaleContext();
  const { resolvedTheme, setTheme } = useTheme();
  const [themeReady, setThemeReady] = useState(false);
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const { settings: terminalSettings, updateSettings: updateTerminalSettings, resetSettings: resetTerminalSettings, isUpdating: isUpdatingTerminal, resolvedFontFamily } = useTerminalSettings();

  useEffect(() => {
    setThemeReady(true);
  }, []);

  const activeTheme = resolvedTheme === "dark" ? "dark" : "light";

  const handleThemeSelect = useCallback(
    (target: "light" | "dark") => {
      if (!themeReady) {
        return;
      }
      setTheme(target === "dark" ? "dark" : "light");
    },
    [setTheme, themeReady]
  );

  const handleLocaleSelect = useCallback(
    async (nextLocale: Locale) => {
      if (nextLocale === locale) {
        return;
      }
      setPendingLocale(nextLocale);
      setUpdateError(null);
      try {
        await setLocale(nextLocale);
      } catch (error) {
        setUpdateError(error instanceof Error ? error.message : String(error));
      } finally {
        setPendingLocale(null);
      }
    },
    [locale, setLocale]
  );

  const backHref = useMemo(() => "/", []);

  const handleFontFamilyChange = useCallback(
    (value: string) => {
      void updateTerminalSettings({ fontFamily: value });
    },
    [updateTerminalSettings]
  );

  const handleFontSizeChange = useCallback(
    (value: number) => {
      void updateTerminalSettings({ fontSize: value });
    },
    [updateTerminalSettings]
  );

  const handleLineHeightChange = useCallback(
    (value: number) => {
      void updateTerminalSettings({ lineHeight: value });
    },
    [updateTerminalSettings]
  );

  const handleLetterSpacingChange = useCallback(
    (value: number) => {
      void updateTerminalSettings({ letterSpacing: value });
    },
    [updateTerminalSettings]
  );

  const previewStyle = useMemo(
    () => ({
      fontFamily: resolvedFontFamily,
      fontSize: `${terminalSettings.fontSize}px`,
      lineHeight: terminalSettings.lineHeight,
      letterSpacing: `${terminalSettings.letterSpacing}px`,
    }),
    [resolvedFontFamily, terminalSettings.fontSize, terminalSettings.letterSpacing, terminalSettings.lineHeight]
  );

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-muted/40">
      <header className="flex h-16 items-center justify-between border-b bg-background/90 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4" />
              {dictionary.navigation.backToHome}
            </Link>
          </Button>
          <div>
            <p className="text-sm font-semibold">{dictionary.title}</p>
            <p className="text-xs text-muted-foreground">{dictionary.description}</p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 px-6 py-6">
        {updateError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {updateError}
          </div>
        )}

        <section className="space-y-4 rounded-xl border border-border/70 bg-background/80 p-6 shadow-sm">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground/90">
              {dictionary.appearanceSection.title}
            </p>
            <p className="text-sm text-muted-foreground">
              {dictionary.appearanceSection.description}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              {dictionary.appearanceSection.toggleLabel}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={activeTheme === "light" ? "default" : "outline"}
                size="sm"
                onClick={() => handleThemeSelect("light")}
                disabled={!themeReady}
              >
                <Sun className="h-4 w-4" />
                {dictionary.appearanceSection.options.light}
                {activeTheme === "light" ? <Check className="h-3.5 w-3.5" /> : null}
              </Button>
              <Button
                type="button"
                variant={activeTheme === "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => handleThemeSelect("dark")}
                disabled={!themeReady}
              >
                <Moon className="h-4 w-4" />
                {dictionary.appearanceSection.options.dark}
                {activeTheme === "dark" ? <Check className="h-3.5 w-3.5" /> : null}
              </Button>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-border/70 bg-background/80 p-6 shadow-sm">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground/90">
              {dictionary.languageSection.title}
            </p>
            <p className="text-sm text-muted-foreground">
              {dictionary.languageSection.description}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex w-full flex-col gap-2 sm:max-w-sm">
              <Label htmlFor="settings-language-select" className="text-xs uppercase text-muted-foreground">
                {dictionary.languageSection.selectLabel}
              </Label>
              <div className="relative">
                <select
                  id="settings-language-select"
                  className="w-full appearance-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  value={pendingLocale ?? locale}
                  onChange={(event) => void handleLocaleSelect(event.target.value as Locale)}
                  disabled={isChanging}
                >
                  {dictionary.languageSection.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {(isChanging || pendingLocale !== null) && (
                  <Loader2 className="absolute inset-y-0 right-3 my-auto h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {dictionary.languageSection.restartNotice}
            </p>
            <p className="text-xs text-muted-foreground">
              {dictionary.languageSection.saveHint}
            </p>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-border/70 bg-background/80 p-6 shadow-sm">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground/90">
              {dictionary.terminalSection.title}
            </p>
            <p className="text-sm text-muted-foreground">
              {dictionary.terminalSection.description}
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="terminal-font-family" className="text-xs uppercase text-muted-foreground">
                  {dictionary.terminalSection.fontFamilyLabel}
                </Label>
                <select
                  id="terminal-font-family"
                  className="w-full appearance-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  value={terminalSettings.fontFamily}
                  onChange={(event) => handleFontFamilyChange(event.target.value)}
                  disabled={isUpdatingTerminal}
                >
                  {dictionary.terminalSection.fontFamilyOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="terminal-font-size" className="text-xs uppercase text-muted-foreground">
                  {dictionary.terminalSection.fontSizeLabel}
                </Label>
                <div className="flex items-center gap-3">
                  <input
                    id="terminal-font-size"
                    type="range"
                    min={10}
                    max={26}
                    step={1}
                    value={terminalSettings.fontSize}
                    onChange={(event) => handleFontSizeChange(Number(event.target.value))}
                    className="flex-1"
                    disabled={isUpdatingTerminal}
                  />
                  <Input
                    type="number"
                    min={10}
                    max={26}
                    value={terminalSettings.fontSize}
                    onChange={(event) => handleFontSizeChange(Number(event.target.value))}
                    className="w-20"
                    disabled={isUpdatingTerminal}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{dictionary.terminalSection.fontSizeHelp}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="terminal-line-height" className="text-xs uppercase text-muted-foreground">
                  {dictionary.terminalSection.lineHeightLabel}
                </Label>
                <div className="flex items-center gap-3">
                  <input
                    id="terminal-line-height"
                    type="range"
                    min={1}
                    max={2}
                    step={0.05}
                    value={terminalSettings.lineHeight}
                    onChange={(event) => handleLineHeightChange(Number(event.target.value))}
                    className="flex-1"
                    disabled={isUpdatingTerminal}
                  />
                  <Input
                    type="number"
                    min={1}
                    max={2}
                    step={0.05}
                    value={terminalSettings.lineHeight}
                    onChange={(event) => handleLineHeightChange(Number(event.target.value))}
                    className="w-20"
                    disabled={isUpdatingTerminal}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{dictionary.terminalSection.lineHeightHelp}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="terminal-letter-spacing" className="text-xs uppercase text-muted-foreground">
                  {dictionary.terminalSection.letterSpacingLabel}
                </Label>
                <div className="flex items-center gap-3">
                  <input
                    id="terminal-letter-spacing"
                    type="range"
                    min={-1}
                    max={2}
                    step={0.1}
                    value={terminalSettings.letterSpacing}
                    onChange={(event) => handleLetterSpacingChange(Number(event.target.value))}
                    className="flex-1"
                    disabled={isUpdatingTerminal}
                  />
                  <Input
                    type="number"
                    min={-1}
                    max={2}
                    step={0.1}
                    value={terminalSettings.letterSpacing}
                    onChange={(event) => handleLetterSpacingChange(Number(event.target.value))}
                    className="w-20"
                    disabled={isUpdatingTerminal}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{dictionary.terminalSection.letterSpacingHelp}</p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUpdatingTerminal}
                onClick={() => void resetTerminalSettings()}
              >
                {dictionary.terminalSection.resetButton}
              </Button>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                {dictionary.terminalSection.previewLabel}
              </p>
              <div className="rounded-md border border-border bg-card/80 p-4 text-sm shadow-inner">
                <pre className="whitespace-pre-wrap" style={previewStyle}>
                  {dictionary.terminalSection.previewSample}
                </pre>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
