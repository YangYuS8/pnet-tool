"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

const LOCAL_STORAGE_KEY = "pnet-tool.terminal-settings";

const FONT_FAMILY_MAP: Record<string, string> = {
  "geist-mono": 'var(--font-geist-mono, "JetBrains Mono", "Fira Code", "Menlo", monospace)',
  "system-mono": 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  "jetbrains-mono": '"JetBrains Mono", "Fira Code", "Menlo", Consolas, monospace',
  "fira-code": '"Fira Code", "JetBrains Mono", "Source Code Pro", monospace',
  "cascadia-code": '"Cascadia Code", "JetBrains Mono", "Fira Code", monospace',
  consolas: 'Consolas, "Courier New", monospace',
};

const DEFAULT_TERMINAL_SETTINGS: TerminalSettingsState = {
  fontFamily: "geist-mono",
  fontSize: 13,
  lineHeight: 1.2,
  letterSpacing: 0,
};

export type TerminalSettingsState = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
};

export type TerminalSettingsContextValue = {
  settings: TerminalSettingsState;
  resolvedFontFamily: string;
  isReady: boolean;
  isUpdating: boolean;
  updateSettings: (partial: Partial<TerminalSettingsState>) => Promise<void>;
  resetSettings: () => Promise<void>;
};

const TerminalSettingsContext = createContext<TerminalSettingsContextValue | null>(null);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function sanitizeSettings(input: Partial<TerminalSettingsState> | null | undefined): TerminalSettingsState {
  const fallback = DEFAULT_TERMINAL_SETTINGS;
  const fontFamily = typeof input?.fontFamily === "string" && input.fontFamily in FONT_FAMILY_MAP ? input.fontFamily : fallback.fontFamily;
  const fontSize = clamp(Number.isFinite(input?.fontSize) ? Number(input?.fontSize) : fallback.fontSize, 10, 26);
  const lineHeight = clamp(Number.isFinite(input?.lineHeight) ? Number(input?.lineHeight) : fallback.lineHeight, 1, 2);
  const letterSpacing = clamp(Number.isFinite(input?.letterSpacing) ? Number(input?.letterSpacing) : fallback.letterSpacing, -1, 2);
  return {
    fontFamily,
    fontSize,
    lineHeight,
    letterSpacing,
  } satisfies TerminalSettingsState;
}

function resolveFontFamily(key: string) {
  return FONT_FAMILY_MAP[key] ?? FONT_FAMILY_MAP[DEFAULT_TERMINAL_SETTINGS.fontFamily];
}

async function readDesktopPreferences(): Promise<Partial<TerminalSettingsState> | null> {
  if (typeof window === "undefined" || !window.desktopBridge?.settings) {
    return null;
  }
  try {
    const settings = await window.desktopBridge.settings.get();
    const raw = settings?.terminal;
    if (!raw || typeof raw !== "object") {
      return null;
    }
    return raw as Partial<TerminalSettingsState>;
  } catch (error) {
    console.warn("Failed to read desktop terminal settings", error);
    return null;
  }
}

function readLocalStoragePreferences(): Partial<TerminalSettingsState> | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage?.getItem(LOCAL_STORAGE_KEY);
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored) as Partial<TerminalSettingsState> | undefined;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn("Failed to read terminal settings from localStorage", error);
    return null;
  }
}

async function persistPreferences(settings: TerminalSettingsState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage?.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("Failed to persist terminal settings to localStorage", error);
  }

  try {
    await window.desktopBridge?.settings?.setTerminalPreferences(settings);
  } catch (error) {
    console.warn("Failed to persist terminal settings to desktop settings", error);
  }
}

export function TerminalSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<TerminalSettingsState>(DEFAULT_TERMINAL_SETTINGS);
  const [isReady, setReady] = useState(false);
  const [isUpdating, setUpdating] = useState(false);
  const pendingRef = useRef<Partial<TerminalSettingsState> | null>(null);

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      const desktopPreferences = await readDesktopPreferences();
      if (!active) {
        return;
      }
      const storedPreferences = desktopPreferences ?? readLocalStoragePreferences();
      if (storedPreferences) {
        setSettings(sanitizeSettings(storedPreferences));
      }
      if (active) {
        setReady(true);
      }
    };

    bootstrap().catch((error) => {
      console.error("Failed to bootstrap terminal settings", error);
      if (active) {
        setReady(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const handleUpdate = useCallback(async (partial: Partial<TerminalSettingsState>) => {
    pendingRef.current = partial;
    setUpdating(true);
    try {
      setSettings((previous) => {
        const merged = sanitizeSettings({ ...previous, ...partial });
        void persistPreferences(merged);
        return merged;
      });
    } finally {
      pendingRef.current = null;
      setUpdating(false);
    }
  }, []);

  const handleReset = useCallback(async () => {
    pendingRef.current = DEFAULT_TERMINAL_SETTINGS;
    setUpdating(true);
    try {
      setSettings(() => {
        void persistPreferences(DEFAULT_TERMINAL_SETTINGS);
        return DEFAULT_TERMINAL_SETTINGS;
      });
    } finally {
      pendingRef.current = null;
      setUpdating(false);
    }
  }, []);

  const value = useMemo<TerminalSettingsContextValue>(
    () => ({
      settings,
      resolvedFontFamily: resolveFontFamily(settings.fontFamily),
      isReady,
      isUpdating,
      updateSettings: handleUpdate,
      resetSettings: handleReset,
    }),
    [handleReset, handleUpdate, isReady, isUpdating, settings]
  );

  return <TerminalSettingsContext.Provider value={value}>{children}</TerminalSettingsContext.Provider>;
}

export function useTerminalSettings() {
  const context = useContext(TerminalSettingsContext);
  if (!context) {
    throw new Error("useTerminalSettings must be used within a TerminalSettingsProvider");
  }
  return context;
}

export function resolveTerminalFontFamily(key: string) {
  return resolveFontFamily(key);
}

export const TERMINAL_FONT_FAMILY_OPTIONS = Object.entries(FONT_FAMILY_MAP).map(([value, css]) => ({
  value,
  css,
}));