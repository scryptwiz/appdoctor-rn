import type { AppDoctorEvent, Transport } from "../core/types.js";

export interface HttpTransportOptions {
  url: string;
  headers?: Record<string, string>;
  maxRetries?: number;
  /** ms */
  initialBackoffMs?: number;
  getExtraBody?: () => Record<string, unknown>;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export function createHttpTransport(options: HttpTransportOptions): Transport {
  const maxRetries = options.maxRetries ?? 3;
  const initialBackoffMs = options.initialBackoffMs ?? 500;

  return {
    async send(events: readonly AppDoctorEvent[]): Promise<void> {
      if (events.length === 0) return;
      const body = {
        events: [...events],
        ...(options.getExtraBody?.() ?? {}),
      };
      let attempt = 0;
      let backoff = initialBackoffMs;
      for (;;) {
        try {
          const res = await fetch(options.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...options.headers,
            },
            body: JSON.stringify(body),
          });
          if (res.ok) return;
          if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            return;
          }
        } catch {
          /* retry */
        }
        attempt += 1;
        if (attempt > maxRetries) return;
        await sleep(backoff);
        backoff *= 2;
      }
    },
  };
}
