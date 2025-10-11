import type { Locale } from "./config";

export type HomeDictionary = {
  navigation: {
    brand: string;
    sessionTitle: string;
    sessionSubtitle: string;
    settingsLabel: string;
  };
  sidebar: {
    title: string;
    description: string;
    quickConnectTitle: string;
    ipLabel: string;
    ipPlaceholder: string;
    portLabel: string;
    connectButton: string;
    tipsTitle: string;
    tips: string[];
  };
  errors: {
    missingHost: string;
  };
  terminal: {
    openButton: string;
    connectingButton: string;
    closeButton: string;
    desktopOnlyHint: string;
    requireIp: string;
    testButton: string;
    autoLaunchOn: string;
    autoLaunchOff: string;
    autoLaunchDescription: string;
    status: {
      idle: string;
      connecting: string;
      connected: string;
      closed: string;
      error: string;
    };
    sessionTabs: {
      headerLabel: string;
      closeAction: string;
      emptyTitle: string;
      emptyDescription: string;
      reorderHint: string;
    };
  };
};

export type SettingsDictionary = {
  title: string;
  description: string;
  navigation: {
    backToHome: string;
  };
  appearanceSection: {
    title: string;
    description: string;
    toggleLabel: string;
    options: {
      light: string;
      dark: string;
    };
  };
  languageSection: {
    title: string;
    description: string;
    options: Array<{
      value: Locale;
      label: string;
      description?: string;
    }>;
    restartNotice: string;
    saveHint: string;
  };
};

export type Dictionaries = {
  home: HomeDictionary;
  settings: SettingsDictionary;
};

export type DictionaryKey = keyof Dictionaries;

export type Dictionary = Dictionaries;

export type LoadedDictionaries = {
  home: HomeDictionary;
  settings: SettingsDictionary;
};

export type LoadedDictionary = LoadedDictionaries;

export type GetDictionary<T extends DictionaryKey = DictionaryKey> = (
  locale: Locale
) => Promise<Dictionaries[T]>;
