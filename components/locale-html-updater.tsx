"use client";

import { useEffect } from "react";

import type { Locale } from "@/lib/i18n/config";

type LocaleHtmlUpdaterProps = {
  locale: Locale;
};

export function LocaleHtmlUpdater({ locale }: LocaleHtmlUpdaterProps) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}
