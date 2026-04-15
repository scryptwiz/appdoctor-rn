import * as react from 'react';
import { ReactNode, ReactElement } from 'react';

type AppDoctorEventName = "screen_load" | "api_request" | "render_event" | "sdk_error";
interface EventContext {
    route?: string;
    component?: string;
    platform?: string;
    appVersion?: string;
    metadata?: Record<string, string | number | boolean>;
}
interface AppDoctorEventBase {
    name: AppDoctorEventName;
    /** Unix ms */
    timestamp: number;
    sessionId: string;
    tags?: Record<string, string>;
    context?: EventContext;
}
interface ScreenLoadEvent extends AppDoctorEventBase {
    name: "screen_load";
    screen: string;
    phase: "start" | "ready";
    /** Time from navigation intent to ready signal (ms), if known */
    durationMs: number;
}
interface NetworkRequestEvent extends AppDoctorEventBase {
    name: "api_request";
    method: string;
    url: string;
    status?: number;
    durationMs: number;
    success: boolean;
    errorMessage?: string;
}
interface RenderCountEvent extends AppDoctorEventBase {
    name: "render_event";
    component: string;
    renderCount: number;
}
interface SdkErrorEvent extends AppDoctorEventBase {
    name: "sdk_error";
    message: string;
    stack?: string;
    errorContext?: string;
}
type AppDoctorEvent = ScreenLoadEvent | NetworkRequestEvent | RenderCountEvent | SdkErrorEvent;
/** Payload accepted by `AppDoctorClient.emit` (union; avoids `Omit` pitfalls on unions). */
type AppDoctorEmitInput = Omit<ScreenLoadEvent, "timestamp" | "sessionId"> | Omit<NetworkRequestEvent, "timestamp" | "sessionId"> | Omit<RenderCountEvent, "timestamp" | "sessionId"> | Omit<SdkErrorEvent, "timestamp" | "sessionId">;
interface Transport {
    send(events: readonly AppDoctorEvent[]): void | Promise<void>;
    flush?: () => void | Promise<void>;
    shutdown?: () => void | Promise<void>;
}
interface AppDoctorConfig {
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
    redactNetworkEvent?: (event: Omit<NetworkRequestEvent, "timestamp" | "sessionId" | "name">) => Partial<Omit<NetworkRequestEvent, "timestamp" | "sessionId" | "name">>;
}

declare class AppDoctorClient {
    readonly sessionId: string;
    private readonly config;
    private readonly transports;
    private queue;
    private flushTimer;
    private fetchPatched;
    private originalFetch;
    constructor(config?: AppDoctorConfig);
    updateConfig(partial: Partial<AppDoctorConfig>): void;
    addTransport(transport: Transport): void;
    emit(event: AppDoctorEmitInput): void;
    private enqueue;
    captureError(message: string, context?: string, err?: unknown): void;
    flush(): Promise<void>;
    shutdown(): Promise<void>;
    private startFlushTimer;
    private restartFlushTimer;
    private safeInternalError;
    private patchFetch;
    private restoreFetch;
    private applyNetworkRedaction;
}

declare function shouldSample(rate: number): boolean;

declare function createConsoleTransport(options?: {
    label?: string;
    slowScreenThresholdMs?: number;
    slowApiThresholdMs?: number;
}): Transport;

interface HttpTransportOptions {
    url: string;
    headers?: Record<string, string>;
    maxRetries?: number;
    /** ms */
    initialBackoffMs?: number;
    getExtraBody?: () => Record<string, unknown>;
}
declare function createHttpTransport(options: HttpTransportOptions): Transport;

/**
 * Best-effort active route name from React Navigation state tree.
 * Avoids a hard dependency on `@react-navigation/native` types at runtime.
 */
declare function getActiveRouteName(state: unknown): string | undefined;

/**
 * Pass the returned listener to `NavigationContainer` as `onStateChange`.
 * Emits `screen_load` when the active route changes and a ready event after the next microtask
 * (approximates first paint/commit after navigation state updates).
 */
declare function createNavigationStateListener(client: AppDoctorClient): {
    listener: (state: unknown) => void;
    reset: () => void;
};

/** Minimal Axios shape to avoid requiring `axios` as a dependency. */
interface AxiosLike {
    interceptors: {
        request: {
            use: (onFulfilled: (value: unknown) => unknown) => number;
            eject: (id: number) => void;
        };
        response: {
            use: (onFulfilled: (value: unknown) => unknown, onRejected?: (error: unknown) => unknown) => number;
            eject: (id: number) => void;
        };
    };
}
interface AxiosInstrumentationOptions {
    redactNetworkEvent?: (event: Omit<NetworkRequestEvent, "timestamp" | "sessionId" | "name">) => Partial<Omit<NetworkRequestEvent, "timestamp" | "sessionId" | "name">>;
}
/**
 * Returns an `eject` function to remove interceptors.
 */
declare function instrumentAxios(axios: AxiosLike, client: AppDoctorClient, options?: AxiosInstrumentationOptions): () => void;

/**
 * Wraps an async call and emits an `api_request` event with a synthetic URL label.
 */
declare function trackApi<T>(client: AppDoctorClient, label: string, fn: () => Promise<T>): Promise<T>;

type AppDoctorProviderProps = AppDoctorConfig & {
    children: ReactNode;
};
declare function AppDoctorProvider({ children, ...config }: AppDoctorProviderProps): ReactElement;

declare const AppDoctorContext: react.Context<AppDoctorClient | null>;

declare function useAppDoctor(): AppDoctorClient;

interface UseTrackScreenOptions {
    client?: AppDoctorClient;
}
/**
 * Emits `screen_load` lifecycle events on mount and ready.
 */
declare function useTrackScreen(screen: string, options?: UseTrackScreenOptions): void;

interface UseTrackRenderOptions {
    client?: AppDoctorClient;
    /** Emit every N renders (default 10) to limit noise */
    every?: number;
}
/**
 * Emits `render_event` periodically when the component re-renders.
 */
declare function useTrackRender(componentName: string, options?: UseTrackRenderOptions): void;

export { AppDoctorClient, type AppDoctorConfig, AppDoctorContext, type AppDoctorEmitInput, type AppDoctorEvent, type AppDoctorEventName, AppDoctorProvider, type AppDoctorProviderProps, type AxiosInstrumentationOptions, type AxiosLike, type EventContext, type HttpTransportOptions, type NetworkRequestEvent, type RenderCountEvent, type ScreenLoadEvent, type SdkErrorEvent, type Transport, createConsoleTransport, createHttpTransport, createNavigationStateListener, getActiveRouteName, instrumentAxios, shouldSample, trackApi, useAppDoctor, useTrackRender, useTrackScreen };
