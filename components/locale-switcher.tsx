"use client";

import { useMemo, useState } from "react";

import { useLocaleContext } from "@/components/locale/locale-provider";
import { Button } from "@/components/ui/button";

export type LocaleSwitchCopy = {
  ariaLabel: string;
  targetLocaleName: string;
  shortLabel: string;
};

export function LocaleSwitcher({ copy }: { copy: LocaleSwitchCopy }) {
  const { locale, availableLocales, setLocale, isChanging } = useLocaleContext();
  const [error, setError] = useState<string | null>(null);
  const targetLocale = useMemo(
    () => availableLocales.find((candidate) => candidate !== locale) ?? locale,
    [availableLocales, locale]
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`${copy.ariaLabel} (${copy.targetLocaleName})`}
        disabled={isChanging}
        onClick={async () => {
          if (targetLocale === locale) {
            return;
          }
          setError(null);
          try {
            await setLocale(targetLocale);
          } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
          }
        }}
      >
        {copy.shortLabel}
      </Button>
      {error ? (
        <span className="sr-only" role="status">
          {error}
        </span>
      ) : null}
    </>
  );
}
