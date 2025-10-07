import type { Dictionaries } from "@/lib/i18n/dictionaries";

export const home: Dictionaries["home"] = {
  navigation: {
    brand: "PNET TOOL",
    sessionTitle: "Device Sessions",
    sessionSubtitle: "Coming soon: auto-launch Telnet windows for routers",
    initButton: "Bootstrap Daemon",
    languageSwitch: {
      ariaLabel: "Switch language",
      targetLocaleName: "中文",
      shortLabel: "中文",
    },
  },
  sidebar: {
    title: "Connection Workbench",
    description: "Manage PNETLab parameters, monitor connectivity, and prepare Telnet sessions.",
    controllerLabel: "PNETLab Controller",
    statusChip: {
      idle: "Not Checked",
      checking: "Checking",
      online: "Online",
      offline: "Offline",
    },
    ipLabel: "PNETLab IP Address",
    ipPlaceholder: "e.g. 192.168.1.10",
    portLabel: "Management Port (HTTP)",
    checkButton: "Check Connectivity",
    checkingButton: "Checking…",
    statusOverviewTitle: "Status Overview",
    statusOverview: {
      idle: "Click the button below to start a health check",
      checking: "Detecting connectivity…",
      offline: "PNETLab is unreachable right now",
      online: "PNETLab responded successfully",
      onlineWithLatency: "Response time {latency} ms",
    },
    futurePlanHint: "Upcoming work:",
    futurePlans: [
      "Trigger Telnet windows from PNETLab events automatically",
      "Manage multiple sessions with quick switching",
      "High-performance terminal rendering (node-pty + xterm.js)",
    ],
    lastCheckPrefix: "Last check: ",
    lastCheckNever: "Not checked yet",
  },
  main: {
    cardTitle: "Terminal Control Center",
    cardDescription: "Live device consoles will land here soon with a SecureFX-like experience.",
    waitingButton: "Awaiting Device Events",
    placeholderTitle: "Terminal staging area",
    placeholderDescription: "When you click a router inside PNETLab, its Telnet window will open here automatically.",
  },
  errors: {
    missingIp: "Please enter the PNETLab IP first",
    unknown: "An unexpected error occurred during the check",
  },
  statusFallback: {
    offline: "PNETLab is temporarily unavailable",
  },
  terminal: {
    openButton: "Open Telnet Session",
    connectingButton: "Connecting…",
    closeButton: "Close Session",
    desktopOnlyHint: "Terminal access is only available in the desktop app.",
    requireIp: "Please fill in the PNETLab IP above to start Telnet.",
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
      detachAction: "Pop out",
      closeAction: "Close",
      emptyTitle: "No Telnet sessions yet",
      emptyDescription:
        "Launch a session from the sidebar or via PNETLab, then manage or detach them here.",
    },
    detachedWindow: {
      title: "Detached Telnet Session",
      subtitle: "This window stays active even if you close the tab in the main app.",
      closeHint: "Close this window or press Ctrl+W to end the session.",
    },
  },
};
