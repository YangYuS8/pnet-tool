"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { useLocaleContext, useLocaleDictionary } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n/config";

export function SettingsPage() {
  const { dictionary } = useLocaleDictionary("settings");
  const { locale, setLocale, isChanging } = useLocaleContext();
  const { resolvedTheme, setTheme } = useTheme();
  const [themeReady, setThemeReady] = useState(false);
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

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
            <div className="grid gap-2 sm:grid-cols-2">
              {dictionary.languageSection.options.map((option) => {
                const isActive = locale === option.value;
                const isPending = pendingLocale === option.value;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant={isActive ? "default" : "outline"}
                    className={cn("justify-between", isActive && "shadow")}
                    disabled={isPending || isChanging}
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
      </main>
    </div>
  );
}
