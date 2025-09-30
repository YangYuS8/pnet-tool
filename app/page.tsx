"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Gauge,
  Loader2,
  RadioTower,
  ShieldQuestion,
  TerminalSquare,
  WifiOff,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type ConnectionState = "idle" | "checking" | "online" | "offline";

type ConnectionStatus = {
  state: ConnectionState;
  latencyMs?: number;
  message?: string;
  httpStatus?: number;
};

const DEFAULT_HTTP_PORT = 80;
const stateChipCopy: Record<ConnectionState, { label: string; tone: string }> = {
  idle: { label: "未检测", tone: "bg-muted text-muted-foreground" },
  checking: { label: "检测中", tone: "bg-amber-500/10 text-amber-500" },
  online: { label: "在线", tone: "bg-green-500/10 text-green-500" },
  offline: { label: "离线", tone: "bg-red-500/10 text-red-500" },
};

async function requestHealth(ip: string, port: number): Promise<ConnectionStatus> {
  const response = await fetch("/api/pnetlab/health", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ip, port }),
  });

  const payload = (await response.json()) as {
    ok: boolean;
    latencyMs?: number;
    status?: number;
    statusText?: string;
    message?: string;
  };

  if (!response.ok || !payload.ok) {
    return {
      state: "offline",
      message: payload.message ?? payload.statusText ?? "无法连接 PNETLab",
      httpStatus: payload.status ?? response.status,
    };
  }

  return {
    state: "online",
    latencyMs: payload.latencyMs,
    httpStatus: payload.status ?? response.status,
    message: payload.statusText,
  };
}

export default function Home() {
  const [ip, setIp] = useState("");
  const [port, setPort] = useState(DEFAULT_HTTP_PORT);
  const [status, setStatus] = useState<ConnectionStatus>({ state: "idle" });
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);

  const statusTone = useMemo(() => stateChipCopy[status.state], [status.state]);

  const handleCheck = async () => {
    if (!ip) {
      setStatus({ state: "offline", message: "请先填写 PNETLab IP" });
      return;
    }

    setStatus({ state: "checking" });
    try {
      const nextStatus = await requestHealth(ip, port);
      setStatus(nextStatus);
      setLastCheckedAt(Date.now());
    } catch (error) {
      setStatus({
        state: "offline",
        message:
          error instanceof Error ? error.message : "检测时发生未知错误",
      });
    }
  };

  const statusDescription = useMemo(() => {
    switch (status.state) {
      case "online":
        return status.latencyMs
          ? `响应时间 ${status.latencyMs} ms`
          : "PNETLab 响应正常";
      case "checking":
        return "正在检测连接状态";
      case "offline":
        return status.message ?? "暂时无法连接 PNETLab";
      default:
        return "点击下方按钮开始检测";
    }
  }, [status]);

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-background via-background to-muted/40">
      <aside className="hidden w-[320px] border-r bg-card/60 backdrop-blur lg:flex lg:flex-col">
        <div className="space-y-2 border-b px-6 py-6">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <RadioTower className="h-4 w-4" /> PNET TOOL
          </div>
          <p className="text-2xl font-semibold">连接工作台</p>
          <p className="text-sm text-muted-foreground">
            管理 PNETLab 参数，监控连接状态，并准备启动 Telnet 会话。
          </p>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                PNETLab 控制节点
              </p>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${statusTone.tone}`}
              >
                {statusTone.label}
              </span>
            </div>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="pnet-ip">PNETLab IP 地址</Label>
                <Input
                  id="pnet-ip"
                  placeholder="例如 192.168.1.10"
                  value={ip}
                  onChange={(event) => setIp(event.target.value.trim())}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pnet-port">管理端口 (HTTP)</Label>
                <Input
                  id="pnet-port"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={65535}
                  value={port}
                  onChange={(event) => setPort(Number(event.target.value) || DEFAULT_HTTP_PORT)}
                />
              </div>
              <Button onClick={handleCheck} disabled={status.state === "checking"}>
                {status.state === "checking" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    检测中…
                  </>
                ) : (
                  <>
                    <Activity className="mr-2 h-4 w-4" />
                    检测连接
                  </>
                )}
              </Button>
            </div>
          </section>

          <Separator className="bg-border/60" />

          <section className="space-y-3 rounded-xl border border-dashed border-border/60 bg-background/60 p-4">
            <div className="flex items-center gap-3">
              {status.state === "online" ? (
                <Gauge className="h-5 w-5 text-green-500" />
              ) : status.state === "offline" ? (
                <WifiOff className="h-5 w-5 text-red-500" />
              ) : (
                <ShieldQuestion className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-semibold">状态概览</p>
                <p className="text-xs text-muted-foreground">{statusDescription}</p>
              </div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              <p>未来计划：</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>自动从 PNETLab 事件中唤起 Telnet 窗口</li>
                <li>多会话管理与快速切换</li>
                <li>高性能终端渲染 (node-pty + xterm.js)</li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground/80">
              最新检测时间：
              {lastCheckedAt
                ? new Date(lastCheckedAt).toLocaleTimeString()
                : "尚未检测"}
            </p>
          </section>
        </div>
      </aside>

      <main className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-background/90 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/60">
              <TerminalSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">设备会话</p>
              <p className="text-xs text-muted-foreground">
                即将实现：自动唤醒路由器 Telnet 窗口
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              初始化守护进程
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <section className="flex flex-1 flex-col gap-6 px-6 py-6">
          <Card className="flex min-h-[360px] flex-1 flex-col overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>终端控制中心</CardTitle>
                <CardDescription>
                  未来将在此展示设备命令行窗口，提供类似 SecureFX 的流畅体验。
                </CardDescription>
              </div>
              <Button variant="secondary" disabled>
                <RadioTower className="mr-2 h-4 w-4" />
                等待设备事件
              </Button>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col items-center justify-center space-y-4 text-center text-sm text-muted-foreground">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-border/70">
                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground/60" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-foreground">终端预备区域</p>
                <p>
                  当你在 PNETLab 中点击路由设备时，我们将自动打开对应的 Telnet 窗口。
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
