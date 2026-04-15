import type { AppDoctorEvent, Transport } from "../core/types.js";

export function createConsoleTransport(
  options: {
    label?: string;
    slowScreenThresholdMs?: number;
    slowApiThresholdMs?: number;
  } = {},
): Transport {
  const label = options.label ?? "AppDoctor";
  const slowScreenThresholdMs = options.slowScreenThresholdMs ?? 1000;
  const slowApiThresholdMs = options.slowApiThresholdMs ?? 800;

  function toHint(event: AppDoctorEvent): string | undefined {
    if (
      event.name === "screen_load" &&
      event.phase === "ready" &&
      event.durationMs >= slowScreenThresholdMs
    ) {
      return `Slow screen "${event.screen}" (${event.durationMs}ms). Check expensive effects and repeated renders.`;
    }
    if (event.name === "api_request" && event.durationMs >= slowApiThresholdMs) {
      return `Slow API "${event.method} ${event.url}" (${event.durationMs}ms). Check server latency, payload size, and retry loops.`;
    }
    return undefined;
  }

  return {
    send(events: readonly AppDoctorEvent[]): void {
      if (events.length === 0) return;
      for (const event of events) {
        const hint = toHint(event);
        if (hint) {
          console.warn(`[${label}] ${hint}`);
        }
      }
      console.log(`[${label}]`, events);
    },
  };
}
