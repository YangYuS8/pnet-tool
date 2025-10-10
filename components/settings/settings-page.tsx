"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n/config";
import type { SettingsDictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

export type SettingsPageProps = {
  dictionary: SettingsDictionary;
  locale: Locale;
};

type AppSettings = {
  preferredLocale?: string;
};

type SettingsUpdateResult = {
  ok?: boolean;
  updated?: boolean;
  requiresRestart?: boolean;
  locale?: string;
  error?: string;
};

type LoadState = "idle" | "loading" | "error";

function coerceLocale(value: string | undefined, supported: Locale[], fallback: Locale): Locale {
  if (value && supported.includes(value as Locale)) {
    return value as Locale;
  }
  return fallback;
}

export function SettingsPage({ dictionary, locale }: SettingsPageProps) {
  const supportedLocales = useMemo(() => dictionary.languageSection.options.map((option) => option.value), [
    dictionary.languageSection.options,
  ]);
  const desktopBridgeAvailable = typeof window !== "undefined" && Boolean(window.desktopBridge?.settings);
  const { resolvedTheme, setTheme } = useTheme();
  const [themeReady, setThemeReady] = useState(false);
  const [currentLocale, setCurrentLocale] = useState<Locale>(locale);
  const [savedLocale, setSavedLocale] = useState<Locale>(locale);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [isSavingLocale, setIsSavingLocale] = useState(false);
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);
  const [loadState, setLoadState] = useState<LoadState>(desktopBridgeAvailable ? "loading" : "idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);

  useEffect(() => {
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (!desktopBridgeAvailable) {
      setCurrentLocale(locale);
      setSavedLocale(locale);
      setNeedsRestart(false);
      setLoadState("idle");
      return;
    }

    let active = true;
    setLoadState("loading");
    window.desktopBridge.settings
      ?.get()
      .then((settings: AppSettings) => {
        if (!active) {
          return;
        }
        const preferred = coerceLocale(settings?.preferredLocale, supportedLocales, locale);
        setCurrentLocale(preferred);
        setSavedLocale(preferred);
        setNeedsRestart(false);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setLoadError(error instanceof Error ? error.message : String(error));
        setCurrentLocale(locale);
        setSavedLocale(locale);
        setNeedsRestart(false);
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setLoadState("idle");
      });

    return () => {
      active = false;
    };
  }, [desktopBridgeAvailable, locale, supportedLocales]);

  const activeTheme = resolvedTheme === "dark" ? "dark" : "light";

  const handleThemeSelect = useCallback(
    (target: "light" | "dark") => {
      if (!themeReady) {
        return;
      }
      if (target === "dark") {
        setTheme("dark");
      } else {
        setTheme("light");
      }
    },
    [setTheme, themeReady]
  );

  const handleLocaleSelect = useCallback(
    async (nextLocale: Locale) => {
      if (nextLocale === savedLocale && !needsRestart) {
        setCurrentLocale(nextLocale);
        return;
      }

      setUpdateError(null);

      if (!desktopBridgeAvailable) {
        setCurrentLocale(nextLocale);
        setNeedsRestart(nextLocale !== savedLocale);
        return;
      }

      setPendingLocale(nextLocale);
      setIsSavingLocale(true);
      setCurrentLocale(nextLocale);

      try {
        const result = (await window.desktopBridge.settings?.setPreferredLocale(nextLocale)) as SettingsUpdateResult;
        if (!result?.ok) {
          throw new Error(result?.error ?? "Failed to update locale");
        }
        const applied = coerceLocale(result.locale, supportedLocales, nextLocale);
        setSavedLocale(applied);
        setNeedsRestart(Boolean(result.requiresRestart));
      } catch (error) {
        setCurrentLocale(savedLocale);
        setNeedsRestart(false);
        setUpdateError(error instanceof Error ? error.message : String(error));
      } finally {
        setPendingLocale(null);
        setIsSavingLocale(false);
      }
    },
    [desktopBridgeAvailable, needsRestart, savedLocale, supportedLocales]
  );

  const handleRestart = useCallback(async () => {
    if (!window.desktopBridge?.restart) {
      return;
    }
    setIsRestarting(true);
    try {
      await window.desktopBridge.restart();
    } catch (error) {
      setIsRestarting(false);
      setUpdateError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const backHref = useMemo(() => `/${locale}`, [locale]);

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
        {loadState === "loading" && (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin align-middle" />
            {dictionary.languageSection.saveHint}
          </div>
        )}
        {loadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {loadError}
          </div>
        )}
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
            <div className="grid gap-2 sm:grid-cols-2">
              {dictionary.languageSection.options.map((option) => {
                const isActive = currentLocale === option.value;
                const isPending = pendingLocale === option.value;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant={isActive ? "default" : "outline"}
                    className={cn("justify-between", isActive && "shadow")}
                    disabled={isSavingLocale && !isActive && !isPending}
                    onClick={() => handleLocaleSelect(option.value)}
                  >
                    <span>{option.label}</span>
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isActive ? (
                      <Check className="h-4 w-4" />
                    ) : null}
                  </Button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {dictionary.languageSection.restartNotice}
            </p>
            <p className="text-xs text-muted-foreground">
              {dictionary.languageSection.saveHint}
            </p>
          </div>
        </section>

        {needsRestart && (
          <section className="space-y-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-5 shadow-sm">
            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
              {dictionary.restart.pending}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={handleRestart}
              disabled={isRestarting || !window.desktopBridge?.restart}
            >
              {isRestarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {dictionary.restart.button}
            </Button>
          </section>
        )}
      </main>
    </div>
  );
}
