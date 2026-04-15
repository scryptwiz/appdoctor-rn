import type {
  AppDoctorConfig,
  AppDoctorEmitInput,
  AppDoctorEvent,
  NetworkRequestEvent,
  SdkErrorEvent,
  Transport,
} from "./types.js";
import {
  DEFAULT_FLUSH_INTERVAL_MS,
  DEFAULT_MAX_QUEUE_SIZE,
} from "./types.js";
import { shouldSample } from "./sampling.js";

function now(): number {
  return Date.now();
}

function newSessionId(): string {
  return `${now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class AppDoctorClient {
  readonly sessionId: string;
  private readonly config: Required<
    Pick<
      AppDoctorConfig,
      | "enabled"
      | "noop"
      | "sampleRate"
      | "flushIntervalMs"
      | "maxQueueSize"
      | "instrumentFetch"
    >
  > &
    Pick<AppDoctorConfig, "tags" | "context" | "redactNetworkEvent">;
  private readonly transports: Transport[];
  private queue: AppDoctorEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | undefined;
  private fetchPatched = false;
  private originalFetch: typeof fetch | undefined;

  constructor(config: AppDoctorConfig = {}) {
    this.sessionId = newSessionId();
    this.config = {
      enabled: config.enabled ?? true,
      noop: config.noop ?? false,
      sampleRate: config.sampleRate ?? 1,
      flushIntervalMs: config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
      maxQueueSize: config.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE,
      instrumentFetch: config.instrumentFetch ?? true,
      tags: config.tags,
      context: config.context,
      redactNetworkEvent: config.redactNetworkEvent,
    };
    this.transports = [...(config.transports ?? [])];
    if (this.config.enabled) {
      this.startFlushTimer();
      if (this.config.instrumentFetch && typeof globalThis.fetch === "function") {
        this.patchFetch();
      }
    }
  }

  updateConfig(partial: Partial<AppDoctorConfig>): void {
    if (partial.enabled !== undefined) {
      (this.config as { enabled: boolean }).enabled = partial.enabled;
    }
    if (partial.noop !== undefined) {
      (this.config as { noop: boolean }).noop = partial.noop;
    }
    if (partial.sampleRate !== undefined) {
      (this.config as { sampleRate: number }).sampleRate = partial.sampleRate;
    }
    if (partial.flushIntervalMs !== undefined) {
      (this.config as { flushIntervalMs: number }).flushIntervalMs =
        partial.flushIntervalMs;
      this.restartFlushTimer();
    }
    if (partial.maxQueueSize !== undefined) {
      (this.config as { maxQueueSize: number }).maxQueueSize =
        partial.maxQueueSize;
    }
    if (partial.tags !== undefined) {
      this.config.tags = partial.tags;
    }
    if (partial.context !== undefined) {
      this.config.context = partial.context;
    }
    if (partial.instrumentFetch !== undefined) {
      const next = partial.instrumentFetch;
      (this.config as { instrumentFetch: boolean }).instrumentFetch = next;
      if (next && !this.fetchPatched) this.patchFetch();
      if (!next && this.fetchPatched) this.restoreFetch();
    }
    if (partial.transports !== undefined) {
      this.transports.length = 0;
      this.transports.push(...partial.transports);
    }
    if (partial.redactNetworkEvent !== undefined) {
      this.config.redactNetworkEvent = partial.redactNetworkEvent;
    }
  }

  addTransport(transport: Transport): void {
    this.transports.push(transport);
  }

  emit(event: AppDoctorEmitInput): void {
    if (!this.config.enabled) return;
    if (this.config.noop) return;
    if (!shouldSample(this.config.sampleRate)) return;

    const { tags: eventTags, ...payload } = event;
    const tags =
      this.config.tags || eventTags
        ? { ...this.config.tags, ...eventTags }
        : undefined;

    const full = {
      ...payload,
      timestamp: now(),
      sessionId: this.sessionId,
      tags,
      context: this.config.context,
    } as AppDoctorEvent;

    this.enqueue(full);
  }

  private enqueue(event: AppDoctorEvent): void {
    if (this.queue.length >= this.config.maxQueueSize) {
      this.queue.shift();
    }
    this.queue.push(event);
  }

  captureError(message: string, context?: string, err?: unknown): void {
    const stack =
      err instanceof Error && typeof err.stack === "string"
        ? err.stack
        : undefined;
    const sdkErr: Omit<SdkErrorEvent, "timestamp" | "sessionId" | "tags"> = {
      name: "sdk_error",
      message,
      stack,
      errorContext: context,
    };
    this.emit(sdkErr);
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    await Promise.all(
      this.transports.map(async (t) => {
        try {
          await t.send(batch);
        } catch (e) {
          this.safeInternalError("transport.send failed", e);
        }
      }),
    );
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.restoreFetch();
    await this.flush();
    await Promise.all(
      this.transports.map(async (t) => {
        if (!t.shutdown) return;
        try {
          await t.shutdown();
        } catch (e) {
          this.safeInternalError("transport.shutdown failed", e);
        }
      }),
    );
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.config.flushIntervalMs);
    if (
      typeof this.flushTimer === "object" &&
      this.flushTimer &&
      "unref" in this.flushTimer &&
      typeof this.flushTimer.unref === "function"
    ) {
      this.flushTimer.unref();
    }
  }

  private restartFlushTimer(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.startFlushTimer();
  }

  private safeInternalError(msg: string, err: unknown): void {
    const dev =
      typeof __DEV__ !== "undefined"
        ? __DEV__
        : typeof process !== "undefined" &&
          process.env?.NODE_ENV !== "production";
    if (dev) console.warn(`[AppDoctor] ${msg}`, err);
  }

  private patchFetch(): void {
    if (this.fetchPatched) return;
    const g = globalThis as { fetch: typeof fetch };
    this.originalFetch = g.fetch.bind(globalThis);
    const originalFetch = this.originalFetch;
    g.fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const start = now();
      let method = "GET";
      let url = "";
      try {
        if (typeof input === "string") {
          url = input;
        } else if (input instanceof URL) {
          url = input.href;
        } else if (typeof Request !== "undefined" && input instanceof Request) {
          url = input.url;
          method = input.method;
        }
        if (init?.method) method = init.method;
      } catch {
        /* ignore */
      }

      const urlForEvent =
        url ||
        (typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : typeof Request !== "undefined" && input instanceof Request
              ? input.url
              : "[request]");

      try {
        const res = await originalFetch(input, init);
        const durationMs = now() - start;
        const event = this.applyNetworkRedaction({
          method,
          url: urlForEvent,
          status: res.status,
          durationMs,
          success: true,
        });
        this.emit({
          name: "api_request",
          ...event,
        });
        return res;
      } catch (e) {
        const durationMs = now() - start;
        const event = this.applyNetworkRedaction({
          method,
          url: urlForEvent,
          durationMs,
          success: false,
          errorMessage: e instanceof Error ? e.message : String(e),
        });
        this.emit({
          name: "api_request",
          ...event,
        });
        throw e;
      }
    };
    this.fetchPatched = true;
  }

  private restoreFetch(): void {
    if (!this.fetchPatched || !this.originalFetch) return;
    (globalThis as { fetch: typeof fetch }).fetch = this.originalFetch;
    this.fetchPatched = false;
    this.originalFetch = undefined;
  }

  private applyNetworkRedaction(
    event: Omit<NetworkRequestEvent, "timestamp" | "sessionId" | "name">,
  ): Omit<NetworkRequestEvent, "timestamp" | "sessionId" | "name"> {
    if (!this.config.redactNetworkEvent) return event;
    const redacted = this.config.redactNetworkEvent(event);
    return { ...event, ...redacted };
  }
}
