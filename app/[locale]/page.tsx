import { notFound } from "next/navigation";

import { HomePage } from "@/components/home/home-page";
import { LocaleHtmlUpdater } from "@/components/locale-html-updater";
import { isLocale, type Locale, locales } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export function generateStaticParams(): Array<{ locale: Locale }> {
  return locales.map((locale) => ({ locale }));
}

export const dynamicParams = false;

type LocalePageProps = {
  params: Promise<{
    locale: string;
  }>;
};

export default async function LocaleHomePage({ params }: LocalePageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale, "home");

  return (
    <>
      <LocaleHtmlUpdater locale={locale} />
      <HomePage dictionary={dictionary} locale={locale} />
    </>
  );
}
