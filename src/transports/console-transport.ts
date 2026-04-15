import type { AppDoctorEvent, Transport } from "../core/types.js";

export interface ConsoleTransportOptions {
  label?: string;
  slowScreenThresholdMs?: number;
  slowApiThresholdMs?: number;
  format?: "pretty" | "raw";
}

export function createConsoleTransport(
  options: ConsoleTransportOptions = {},
): Transport {
  const label = options.label ?? "AppDoctor";
  const slowScreenThresholdMs = options.slowScreenThresholdMs ?? 1000;
  const slowApiThresholdMs = options.slowApiThresholdMs ?? 800;
  const format = options.format ?? "pretty";

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

  function toPrettyLine(event: AppDoctorEvent): string {
    if (event.name === "screen_load") {
      return `screen ${event.screen} phase=${event.phase} duration=${event.durationMs}ms`;
    }
    if (event.name === "api_request") {
      const status = event.status ?? "n/a";
      return `api ${event.method} ${event.url} status=${status} duration=${event.durationMs}ms success=${event.success}`;
    }
    if (event.name === "render_event") {
      return `render ${event.component} count=${event.renderCount}`;
    }
    return `sdk_error ${event.message}`;
  }

  return {
    send(events: readonly AppDoctorEvent[]): void {
      if (events.length === 0) return;
      for (const event of events) {
        const hint = toHint(event);
        if (hint) {
          console.warn(`[${label}] ${hint}`);
        }
        if (format === "pretty") {
          console.log(`[${label}] ${toPrettyLine(event)}`);
        }
      }
      if (format === "raw") {
        console.log(`[${label}]`, events);
      }
    },
  };
}
