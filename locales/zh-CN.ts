import type { Dictionaries } from "@/lib/i18n/dictionaries";

export const home: Dictionaries["home"] = {
  navigation: {
    brand: "PNET TOOL",
    sessionTitle: "设备会话",
    sessionSubtitle: "PNETLab 发送 telnet:// 链接后即可自动接管。",
    settingsLabel: "打开设置",
  },
  sidebar: {
    title: "会话工作台",
    description: "可以手动发起 Telnet 会话，也可以等待 PNETLab 自动推送设备。",
    quickConnectTitle: "快速连接",
    ipLabel: "目标主机",
    ipPlaceholder: "例如 192.168.1.10",
    portLabel: "Telnet 端口",
    connectButton: "开始会话",
    tipsTitle: "小提示",
    tips: [
      "也可以直接在浏览器中点击 PNETLab 的 telnet:// 链接来唤起会话。",
      "会话会一直保留，直到在列表中关闭它。",
      "支持拖动列表项来调整会话顺序。",
    ],
  },
  errors: {
    missingHost: "请先填写主机地址再启动会话。",
  },
  terminal: {
    openButton: "打开 Telnet 会话",
    connectingButton: "连接中…",
    closeButton: "关闭会话",
    desktopOnlyHint: "终端功能仅在桌面应用中可用。",
    requireIp: "请先补全主机信息后再启动 Telnet。",
    testButton: "进行会话测试",
    autoLaunchOn: "自动连接（预留）",
    autoLaunchOff: "开启自动连接",
    autoLaunchDescription: "后续将支持在满足条件时自动发起 Telnet 会话。",
    status: {
      idle: "准备就绪",
      connecting: "正在连接设备…",
      connected: "连接成功",
      closed: "会话已关闭",
      error: "连接失败",
    },
    sessionTabs: {
      headerLabel: "Telnet 会话",
      closeAction: "关闭",
      emptyTitle: "还没有 Telnet 会话",
      emptyDescription:
        "可以在侧栏发起测试，或从 PNETLab 点击设备，这里会显示所有连接。",
      reorderHint: "可以拖动列表项调整顺序。",
    },
  },
};

export const settings: Dictionaries["settings"] = {
  title: "应用设置",
  description: "调整主题外观与语言偏好。",
  navigation: {
    backToHome: "返回会话",
  },
  appearanceSection: {
    title: "外观",
    description: "在浅色与深色主题之间切换，效果会立即生效。",
    toggleLabel: "主题",
    options: {
      light: "浅色",
      dark: "深色",
    },
  },
  languageSection: {
    title: "语言",
    description: "选择下次启动时使用的界面语言。",
    options: [
      { value: "zh-CN", label: "简体中文" },
      { value: "en", label: "English" },
    ],
    restartNotice: "切换语言需要重新启动应用才能生效。",
    saveHint: "选择会自动保存。",
  },
  restart: {
    button: "立即重启",
    pending: "请重新启动应用以应用新语言。",
  },
};
