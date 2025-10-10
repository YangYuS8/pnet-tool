import type { Dictionaries } from "@/lib/i18n/dictionaries";

export const home: Dictionaries["home"] = {
  navigation: {
    brand: "PNET TOOL",
    sessionTitle: "Device Sessions",
    sessionSubtitle: "Sessions are ready whenever PNETLab opens a telnet link.",
    settingsLabel: "Open settings",
  },
  sidebar: {
    title: "Session Workspace",
    description: "Launch manual Telnet sessions or wait for PNETLab to deliver devices here.",
    quickConnectTitle: "Quick connect",
    ipLabel: "Target host",
    ipPlaceholder: "e.g. 192.168.1.10",
    portLabel: "Telnet port",
    connectButton: "Start session",
    tipsTitle: "Tips",
    tips: [
      "You can also trigger sessions directly from PNETLab via telnet:// links.",
      "Sessions keep running until you close them from the list.",
      "Drag items in the list to reorder active sessions.",
    ],
  },
  errors: {
    missingHost: "Please enter a host before starting a session.",
  },
  terminal: {
    openButton: "Open Telnet Session",
    connectingButton: "Connecting…",
    closeButton: "Close Session",
    desktopOnlyHint: "Terminal access is only available in the desktop app.",
    requireIp: "Please provide the host information before starting Telnet.",
    testButton: "Run Session Test",
    autoLaunchOn: "Auto-connect on health pass",
    autoLaunchOff: "Enable auto-connect",
    autoLaunchDescription: "When enabled, a Telnet session will open automatically after a successful PNETLab health check.",
    status: {
      idle: "Ready to connect",
      connecting: "Connecting to device…",
      connected: "Connected",
      closed: "Session closed",
      error: "Connection failed",
    },
    sessionTabs: {
      headerLabel: "Telnet Sessions",
      closeAction: "Close",
      emptyTitle: "No Telnet sessions yet",
      emptyDescription:
        "Launch a session from the sidebar or via PNETLab to see it listed here.",
      reorderHint: "Drag items to reorder your session list.",
    },
  },
};

export const settings: Dictionaries["settings"] = {
  title: "Application settings",
  description: "Fine-tune how PNET Tool looks and which language it uses.",
  navigation: {
    backToHome: "Back to sessions",
  },
  appearanceSection: {
    title: "Appearance",
    description: "Switch between light and dark themes. Changes apply immediately.",
    toggleLabel: "Theme",
    options: {
      light: "Light",
      dark: "Dark",
    },
  },
  languageSection: {
    title: "Language",
    description: "Choose the interface language for the next launch.",
    options: [
      { value: "zh-CN", label: "简体中文" },
      { value: "en", label: "English" },
    ],
    restartNotice: "Changing the language requires restarting the application.",
    saveHint: "Your selection is saved automatically.",
  },
  restart: {
    button: "Restart now",
    pending: "Restart the app to apply the new language.",
  },
};
