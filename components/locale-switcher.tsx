"use client";

import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";

import type { Locale } from "@/lib/i18n/config";
import { locales } from "@/lib/i18n/config";

export type LocaleSwitchCopy = {
  ariaLabel: string;
  targetLocaleName: string;
  shortLabel: string;
};

function buildSwitchPath(
  pathname: string,
  searchParams: URLSearchParams,
  targetLocale: Locale
) {
  const segments = pathname.split("/");
  if (locales.includes(segments[1] as Locale)) {
    segments[1] = targetLocale;
  } else {
    segments.splice(1, 0, targetLocale);
  }
  const basePath = segments.join("/") || "/";
  const queryString = searchParams.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

export function LocaleSwitcher({ copy }: { copy: LocaleSwitchCopy }) {
  const params = useParams();
  const pathname = usePathname() ?? "/";
  const searchParamsValues = useSearchParams();
  const currentLocale = (params?.locale as Locale) ?? locales[0];
  const targetLocale = locales.find((locale) => locale !== currentLocale) ?? locales[0];

  const href = buildSwitchPath(
    pathname,
    new URLSearchParams(searchParamsValues?.toString()),
    targetLocale
  );

  return (
    <Link
      href={href}
      aria-label={`${copy.ariaLabel} (${copy.targetLocaleName})`}
      className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {copy.shortLabel}
    </Link>
  );
}
