import { NextRequest, NextResponse } from "next/server";

type HealthRequest = {
  ip?: string;
  port?: number;
};

const DEFAULT_TIMEOUT = 4000;
const DEFAULT_PORT = 80;

function sanitizeHost(host: string): boolean {
  return /^[a-zA-Z0-9.-]+$/.test(host);
}

export async function POST(request: NextRequest) {
  let payload: HealthRequest;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "请求体不是有效的 JSON" },
      { status: 400 }
    );
  }

  const { ip, port } = payload ?? {};

  if (!ip || typeof ip !== "string" || !sanitizeHost(ip)) {
    return NextResponse.json(
      { ok: false, message: "请提供有效的 PNETLab IP 地址" },
      { status: 400 }
    );
  }

  const portNumber = Number.isInteger(port) ? Number(port) : DEFAULT_PORT;

  if (portNumber <= 0 || portNumber > 65535) {
    return NextResponse.json(
      { ok: false, message: "端口号必须在 1-65535 之间" },
      { status: 400 }
    );
  }

  const targetUrl = `http://${ip}:${portNumber}/`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
  const startedAt = performance.now();

  try {
    const response = await fetch(targetUrl, {
      method: "HEAD",
      signal: controller.signal,
    });

    const latencyMs = Math.round(performance.now() - startedAt);
    const reachable = response.ok || response.status < 500;

    return NextResponse.json({
      ok: reachable,
      status: response.status,
      statusText: response.statusText,
      latencyMs,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "PNETLab 无法连接",
      },
      { status: 504 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
