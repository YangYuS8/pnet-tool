const HOST_PATTERN = /^[a-zA-Z0-9.-]+$/;

export const DEFAULT_PNETLAB_PORT = 80;
export const DEFAULT_PNETLAB_TIMEOUT = 4000;

export type PnetlabHealthProbeResult =
  | {
      ok: true;
      status: number;
      statusText: string;
      latencyMs: number;
    }
  | {
      ok: false;
      message: string;
      status?: number;
      statusText?: string;
    };

export function sanitizePnetlabHost(host: string): boolean {
  return HOST_PATTERN.test(host);
}

export async function probePnetlabHealth(
  ip: string,
  port: number = DEFAULT_PNETLAB_PORT,
  timeoutMs: number = DEFAULT_PNETLAB_TIMEOUT
): Promise<PnetlabHealthProbeResult> {
  const targetUrl = `http://${ip}:${port}/`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(targetUrl, {
      method: "HEAD",
      signal: controller.signal,
    });

    const latencyMs = Date.now() - startedAt;
    const reachable = response.ok || response.status < 500;

    if (!reachable) {
      return {
        ok: false,
        message: response.statusText || "PNETLab 无法连接",
        status: response.status,
        statusText: response.statusText,
      };
    }

    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      latencyMs,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "PNETLab 无法连接",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
