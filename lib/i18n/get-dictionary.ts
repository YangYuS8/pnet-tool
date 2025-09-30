import type { Locale } from "./config";
import type { Dictionaries, DictionaryKey } from "./dictionaries";

export async function getDictionary<K extends DictionaryKey>(
  locale: Locale,
  namespace: K
): Promise<Dictionaries[K]> {
  switch (namespace) {
    case "home":
      if (locale === "en") {
        return (await import("@/locales/en")).home;
      }
      return (await import("@/locales/zh-CN")).home;
    default:
      throw new Error(`Unknown dictionary namespace: ${namespace as string}`);
  }
}
