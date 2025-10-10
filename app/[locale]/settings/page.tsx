import { notFound } from "next/navigation";

import { DesktopWindowChrome } from "@/components/desktop/window-chrome";
import { LocaleHtmlUpdater } from "@/components/locale-html-updater";
import { SettingsPage } from "@/components/settings/settings-page";
import { isLocale, type Locale, locales } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export function generateStaticParams(): Array<{ locale: Locale }> {
  return locales.map((locale) => ({ locale }));
}

export const dynamicParams = false;

type SettingsRouteProps = {
  params: Promise<{
    locale: string;
  }>;
};

export default async function LocaleSettingsRoute({ params }: SettingsRouteProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale, "settings");

  return (
    <>
      <LocaleHtmlUpdater locale={locale} />
      <DesktopWindowChrome>
        <SettingsPage dictionary={dictionary} locale={locale} />
      </DesktopWindowChrome>
    </>
  );
}
