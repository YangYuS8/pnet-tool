"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { LocaleHtmlUpdater } from "@/components/locale-html-updater";
import { defaultLocale, locales, type Locale } from "@/lib/i18n/config";
import type { DictionaryKey, Dictionaries, LoadedDictionaries } from "@/lib/i18n/dictionaries";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { home as zhCNHome, settings as zhCNSettings } from "@/locales/zh-CN";

const LOCAL_STORAGE_KEY = "pnet-tool.locale";

const DEFAULT_DICTIONARIES: LoadedDictionaries = {
  home: zhCNHome,
  settings: zhCNSettings,
};

type LocaleContextValue = {
  locale: Locale;
  dictionaries: LoadedDictionaries;
  availableLocales: readonly Locale[];
  isReady: boolean;
  isChanging: boolean;
  setLocale: (locale: Locale) => Promise<void>;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function isSupportedLocale(candidate: unknown): candidate is Locale {
  return typeof candidate === "string" && locales.includes(candidate as Locale);
}

async function loadAllDictionaries(locale: Locale): Promise<LoadedDictionaries> {
  if (locale === defaultLocale) {
    return DEFAULT_DICTIONARIES;
  }
  const [homeDictionary, settingsDictionary] = await Promise.all([
    getDictionary(locale, "home"),
    getDictionary(locale, "settings"),
  ]);
  return {
    home: homeDictionary,
    settings: settingsDictionary,
  } satisfies LoadedDictionaries;
}

async function readDesktopPreferredLocale(): Promise<Locale | null> {
  if (typeof window === "undefined" || !window.desktopBridge?.settings) {
    return null;
  }
  try {
  const settings = await window.desktopBridge!.settings!.get();
    if (isSupportedLocale(settings?.preferredLocale)) {
      return settings.preferredLocale;
    }
  } catch (error) {
    console.warn("Failed to read desktop preferred locale", error);
  }
  return null;
}

function readLocalStorageLocale(): Locale | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage?.getItem(LOCAL_STORAGE_KEY);
    return isSupportedLocale(stored) ? (stored as Locale) : null;
  } catch (error) {
    console.warn("Failed to read locale from localStorage", error);
    return null;
  }
}

function detectNavigatorLocale(): Locale | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  const candidates: string[] = [];
  if (navigator.language) {
    candidates.push(navigator.language);
  }
  if (Array.isArray(navigator.languages)) {
    candidates.push(...navigator.languages);
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const normalized = candidate.toLowerCase();
    const matched = locales.find((locale) => {
      const lower = locale.toLowerCase();
      return normalized === lower || normalized.startsWith(`${lower}-`);
    });
    if (matched) {
      return matched;
    }
  }

  return null;
}

async function persistPreferredLocale(locale: Locale) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage?.setItem(LOCAL_STORAGE_KEY, locale);
  } catch (error) {
    console.warn("Failed to persist locale to localStorage", error);
  }

  try {
    await window.desktopBridge?.settings?.setPreferredLocale(locale);
  } catch (error) {
    console.warn("Failed to persist locale to desktop settings", error);
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [dictionaries, setDictionaries] = useState<LoadedDictionaries>(DEFAULT_DICTIONARIES);
  const [isReady, setReady] = useState(false);
  const [isChanging, setChanging] = useState(false);
  const pendingLocaleRef = useRef<Locale | null>(null);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const desktopLocale = await readDesktopPreferredLocale();
      if (!active) {
        return;
      }

      const storedLocale = desktopLocale ?? readLocalStorageLocale() ?? detectNavigatorLocale();
      if (storedLocale && storedLocale !== defaultLocale) {
        setChanging(true);
        try {
          const nextDictionaries = await loadAllDictionaries(storedLocale);
          if (!active) {
            return;
          }
          setLocaleState(storedLocale);
          setDictionaries(nextDictionaries);
        } catch (error) {
          console.error("Failed to preload stored locale", error);
        } finally {
          if (active) {
            setChanging(false);
          }
        }
      }

      if (active) {
        setReady(true);
      }
    };

    bootstrap().catch((error) => {
      console.error("Failed to bootstrap locale context", error);
      if (active) {
        setReady(true);
        setChanging(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const handleSetLocale = useCallback(
    async (nextLocale: Locale) => {
      if (nextLocale === locale) {
        return;
      }

      if (pendingLocaleRef.current === nextLocale) {
        return;
      }

      pendingLocaleRef.current = nextLocale;
      setChanging(true);

      try {
        const nextDictionaries = await loadAllDictionaries(nextLocale);
        setLocaleState(nextLocale);
        setDictionaries(nextDictionaries);
        await persistPreferredLocale(nextLocale);
      } catch (error) {
        console.error("Failed to switch locale", error);
        throw error instanceof Error ? error : new Error(String(error));
      } finally {
        pendingLocaleRef.current = null;
        setChanging(false);
      }
    },
    [locale]
  );

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      dictionaries,
      availableLocales: locales,
      isReady,
      isChanging,
      setLocale: handleSetLocale,
    }),
    [dictionaries, handleSetLocale, isChanging, isReady, locale]
  );

  return (
    <LocaleContext.Provider value={value}>
      <LocaleHtmlUpdater locale={locale} />
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocaleContext(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocaleContext must be used within a LocaleProvider");
  }
  return context;
}

export function useLocaleDictionary<K extends DictionaryKey>(namespace: K): {
  dictionary: Dictionaries[K];
  locale: Locale;
  availableLocales: readonly Locale[];
  isReady: boolean;
  isChanging: boolean;
  setLocale: (locale: Locale) => Promise<void>;
} {
  const context = useLocaleContext();
  return {
    dictionary: context.dictionaries[namespace],
    locale: context.locale,
    availableLocales: context.availableLocales,
    isReady: context.isReady,
    isChanging: context.isChanging,
    setLocale: context.setLocale,
  };
}
