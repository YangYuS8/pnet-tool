import type { Dictionaries } from "@/lib/i18n/dictionaries";

export const home: Dictionaries["home"] = {
  navigation: {
    brand: "PNET TOOL",
    sessionTitle: "设备会话",
    sessionSubtitle: "即将实现：自动唤醒路由器 Telnet 窗口",
    initButton: "初始化守护进程",
    languageSwitch: {
      ariaLabel: "切换语言",
      targetLocaleName: "English",
      shortLabel: "EN",
    },
  },
  sidebar: {
    title: "连接工作台",
    description: "管理 PNETLab 参数，监控连接状态，并准备启动 Telnet 会话。",
    controllerLabel: "PNETLab 控制节点",
    statusChip: {
      idle: "未检测",
      checking: "检测中",
      online: "在线",
      offline: "离线",
    },
    ipLabel: "PNETLab IP 地址",
    ipPlaceholder: "例如 192.168.1.10",
    portLabel: "管理端口 (HTTP)",
    checkButton: "检测连接",
    checkingButton: "检测中…",
    statusOverviewTitle: "状态概览",
    statusOverview: {
      idle: "点击下方按钮开始检测",
      checking: "正在检测连接状态",
      offline: "暂时无法连接 PNETLab",
      online: "PNETLab 响应正常",
      onlineWithLatency: "响应时间 {latency} ms",
    },
    futurePlanHint: "未来计划：",
    futurePlans: [
      "自动从 PNETLab 事件中唤起 Telnet 窗口",
      "多会话管理与快速切换",
      "高性能终端渲染 (node-pty + xterm.js)",
    ],
    lastCheckPrefix: "最新检测时间：",
    lastCheckNever: "尚未检测",
  },
  main: {
    cardTitle: "终端控制中心",
    cardDescription: "未来将在此展示设备命令行窗口，提供类似 SecureFX 的流畅体验。",
    waitingButton: "等待设备事件",
    placeholderTitle: "终端预备区域",
    placeholderDescription: "当你在 PNETLab 中点击路由设备时，我们将自动打开对应的 Telnet 窗口。",
  },
  errors: {
    missingIp: "请先填写 PNETLab IP",
    unknown: "检测时发生未知错误",
  },
  statusFallback: {
    offline: "暂时无法连接 PNETLab",
  },
};
