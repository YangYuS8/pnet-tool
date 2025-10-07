import { NextRequest, NextResponse } from "next/server";

import {
  DEFAULT_PNETLAB_PORT,
  DEFAULT_PNETLAB_TIMEOUT,
  probePnetlabHealth,
  sanitizePnetlabHost,
} from "@/lib/pnetlab/health";

type HealthRequest = {
  ip?: string;
  port?: number;
};

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

  if (!ip || typeof ip !== "string" || !sanitizePnetlabHost(ip)) {
    return NextResponse.json(
      { ok: false, message: "请提供有效的 PNETLab IP 地址" },
      { status: 400 }
    );
  }

  const portNumber = Number.isInteger(port) ? Number(port) : DEFAULT_PNETLAB_PORT;

  if (portNumber <= 0 || portNumber > 65535) {
    return NextResponse.json(
      { ok: false, message: "端口号必须在 1-65535 之间" },
      { status: 400 }
    );
  }

  const result = await probePnetlabHealth(ip, portNumber, DEFAULT_PNETLAB_TIMEOUT);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: result.message,
        status: result.status,
        statusText: result.statusText,
      },
      { status: result.status ?? 504 }
    );
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    statusText: result.statusText,
    latencyMs: result.latencyMs,
  });
}
