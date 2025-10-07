import type { Locale } from "./config";

export type ConnectionState = "idle" | "checking" | "online" | "offline";

export type HomeDictionary = {
  navigation: {
    brand: string;
    sessionTitle: string;
    sessionSubtitle: string;
    initButton: string;
    languageSwitch: {
      ariaLabel: string;
      targetLocaleName: string;
      shortLabel: string;
    };
  };
  sidebar: {
    title: string;
    description: string;
    controllerLabel: string;
    statusChip: Record<ConnectionState, string>;
    ipLabel: string;
    ipPlaceholder: string;
    portLabel: string;
    checkButton: string;
    checkingButton: string;
    statusOverviewTitle: string;
    statusOverview: {
      idle: string;
      checking: string;
      offline: string;
      online: string;
      onlineWithLatency: string;
    };
    futurePlanHint: string;
    futurePlans: string[];
    lastCheckPrefix: string;
    lastCheckNever: string;
  };
  main: {
    cardTitle: string;
    cardDescription: string;
    waitingButton: string;
    placeholderTitle: string;
    placeholderDescription: string;
  };
  errors: {
    missingIp: string;
    unknown: string;
  };
  statusFallback: {
    offline: string;
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
      detachAction: string;
      closeAction: string;
      emptyTitle: string;
      emptyDescription: string;
    };
    detachedWindow: {
      title: string;
      subtitle: string;
      closeHint: string;
    };
  };
};

export type Dictionaries = {
  home: HomeDictionary;
};

export type DictionaryKey = keyof Dictionaries;

export type Dictionary = Dictionaries;

export type LoadedDictionaries = {
  home: HomeDictionary;
};

export type LoadedDictionary = LoadedDictionaries;

export type GetDictionary<T extends DictionaryKey = DictionaryKey> = (
  locale: Locale
) => Promise<Dictionaries[T]>;
