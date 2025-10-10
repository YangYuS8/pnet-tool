import type { Locale } from "./config";
import type { Dictionaries, DictionaryKey } from "./dictionaries";

export async function getDictionary<K extends DictionaryKey>(
  locale: Locale,
  namespace: K
): Promise<Dictionaries[K]> {
  switch (namespace) {
    case "home": {
      const dictionaryModule = locale === "en" ? await import("@/locales/en") : await import("@/locales/zh-CN");
      return dictionaryModule.home as Dictionaries[K];
    }
    case "settings": {
      const dictionaryModule = locale === "en" ? await import("@/locales/en") : await import("@/locales/zh-CN");
      return dictionaryModule.settings as Dictionaries[K];
    }
    default:
      throw new Error(`Unknown dictionary namespace: ${namespace as string}`);
  }
}
