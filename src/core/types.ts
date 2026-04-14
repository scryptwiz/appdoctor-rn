export type AppDoctorEventName =
  | "screen_load"
  | "api_request"
  | "render_event"
  | "sdk_error";

export interface EventContext {
  route?: string;
  component?: string;
  platform?: string;
  appVersion?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface AppDoctorEventBase {
  name: AppDoctorEventName;
  /** Unix ms */
  timestamp: number;
  sessionId: string;
  tags?: Record<string, string>;
  context?: EventContext;
}

export interface ScreenLoadEvent extends AppDoctorEventBase {
  name: "screen_load";
  screen: string;
  phase: "start" | "ready";
  /** Time from navigation intent to ready signal (ms), if known */
  durationMs: number;
}

export interface NetworkRequestEvent extends AppDoctorEventBase {
  name: "api_request";
  method: string;
  url: string;
  status?: number;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
}

export interface RenderCountEvent extends AppDoctorEventBase {
  name: "render_event";
  component: string;
  renderCount: number;
}

export interface SdkErrorEvent extends AppDoctorEventBase {
  name: "sdk_error";
  message: string;
  stack?: string;
  errorContext?: string;
}

export type AppDoctorEvent =
  | ScreenLoadEvent
  | NetworkRequestEvent
  | RenderCountEvent
  | SdkErrorEvent;

/** Payload accepted by `AppDoctorClient.emit` (union; avoids `Omit` pitfalls on unions). */
export type AppDoctorEmitInput =
  | Omit<ScreenLoadEvent, "timestamp" | "sessionId">
  | Omit<NetworkRequestEvent, "timestamp" | "sessionId">
  | Omit<RenderCountEvent, "timestamp" | "sessionId">
  | Omit<SdkErrorEvent, "timestamp" | "sessionId">;

export interface Transport {
  send(events: readonly AppDoctorEvent[]): void | Promise<void>;
  flush?: () => void | Promise<void>;
  shutdown?: () => void | Promise<void>;
}

export interface AppDoctorConfig {
  enabled?: boolean;
  /** Shortcut to disable all internal work while preserving integration calls */
  noop?: boolean;
  /** 0–1, default 1 */
  sampleRate?: number;
  flushIntervalMs?: number;
  maxQueueSize?: number;
  transports?: Transport[];
  tags?: Record<string, string>;
  /** Add context to every emitted event */
  context?: EventContext;
  /** When true, wraps global fetch (restore on shutdown) */
  instrumentFetch?: boolean;
  /**
   * Redacts/sanitizes network event fields before emission.
   * Returning partial values overrides the computed payload.
   */
  redactNetworkEvent?: (
    event: Omit<NetworkRequestEvent, "timestamp" | "sessionId" | "name">,
  ) => Partial<Omit<NetworkRequestEvent, "timestamp" | "sessionId" | "name">>;
}

export const DEFAULT_FLUSH_INTERVAL_MS = 2000;
export const DEFAULT_MAX_QUEUE_SIZE = 200;
