'use strict';

var react = require('react');
var jsxRuntime = require('react/jsx-runtime');

// src/core/types.ts
var DEFAULT_FLUSH_INTERVAL_MS = 2e3;
var DEFAULT_MAX_QUEUE_SIZE = 200;

// src/core/sampling.ts
function shouldSample(rate) {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  return Math.random() < rate;
}

// src/core/client.ts
function now() {
  return Date.now();
}
function newSessionId() {
  return `${now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
var AppDoctorClient = class {
  constructor(config = {}) {
    this.queue = [];
    this.fetchPatched = false;
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
      redactNetworkEvent: config.redactNetworkEvent
    };
    this.transports = [...config.transports ?? []];
    if (this.config.enabled) {
      this.startFlushTimer();
      if (this.config.instrumentFetch && typeof globalThis.fetch === "function") {
        this.patchFetch();
      }
    }
  }
  updateConfig(partial) {
    if (partial.enabled !== void 0) {
      this.config.enabled = partial.enabled;
    }
    if (partial.noop !== void 0) {
      this.config.noop = partial.noop;
    }
    if (partial.sampleRate !== void 0) {
      this.config.sampleRate = partial.sampleRate;
    }
    if (partial.flushIntervalMs !== void 0) {
      this.config.flushIntervalMs = partial.flushIntervalMs;
      this.restartFlushTimer();
    }
    if (partial.maxQueueSize !== void 0) {
      this.config.maxQueueSize = partial.maxQueueSize;
    }
    if (partial.tags !== void 0) {
      this.config.tags = partial.tags;
    }
    if (partial.context !== void 0) {
      this.config.context = partial.context;
    }
    if (partial.instrumentFetch !== void 0) {
      const next = partial.instrumentFetch;
      this.config.instrumentFetch = next;
      if (next && !this.fetchPatched) this.patchFetch();
      if (!next && this.fetchPatched) this.restoreFetch();
    }
    if (partial.transports !== void 0) {
      this.transports.length = 0;
      this.transports.push(...partial.transports);
    }
    if (partial.redactNetworkEvent !== void 0) {
      this.config.redactNetworkEvent = partial.redactNetworkEvent;
    }
  }
  addTransport(transport) {
    this.transports.push(transport);
  }
  emit(event) {
    if (!this.config.enabled) return;
    if (this.config.noop) return;
    if (!shouldSample(this.config.sampleRate)) return;
    const { tags: eventTags, ...payload } = event;
    const tags = this.config.tags || eventTags ? { ...this.config.tags, ...eventTags } : void 0;
    const full = {
      ...payload,
      timestamp: now(),
      sessionId: this.sessionId,
      tags,
      context: this.config.context
    };
    this.enqueue(full);
  }
  enqueue(event) {
    if (this.queue.length >= this.config.maxQueueSize) {
      this.queue.shift();
    }
    this.queue.push(event);
  }
  captureError(message, context, err) {
    const stack = err instanceof Error && typeof err.stack === "string" ? err.stack : void 0;
    const sdkErr = {
      name: "sdk_error",
      message,
      stack,
      errorContext: context
    };
    this.emit(sdkErr);
  }
  async flush() {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    await Promise.all(
      this.transports.map(async (t) => {
        try {
          await t.send(batch);
        } catch (e) {
          this.safeInternalError("transport.send failed", e);
        }
      })
    );
  }
  async shutdown() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = void 0;
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
      })
    );
  }
  startFlushTimer() {
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.config.flushIntervalMs);
    if (typeof this.flushTimer === "object" && this.flushTimer && "unref" in this.flushTimer && typeof this.flushTimer.unref === "function") {
      this.flushTimer.unref();
    }
  }
  restartFlushTimer() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.startFlushTimer();
  }
  safeInternalError(msg, err) {
    const dev = typeof __DEV__ !== "undefined" ? __DEV__ : typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
    if (dev) console.warn(`[AppDoctor] ${msg}`, err);
  }
  patchFetch() {
    if (this.fetchPatched) return;
    const g = globalThis;
    this.originalFetch = g.fetch.bind(globalThis);
    const originalFetch = this.originalFetch;
    g.fetch = async (input, init) => {
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
      }
      const urlForEvent = url || (typeof input === "string" ? input : input instanceof URL ? input.href : typeof Request !== "undefined" && input instanceof Request ? input.url : "[request]");
      try {
        const res = await originalFetch(input, init);
        const durationMs = now() - start;
        const event = this.applyNetworkRedaction({
          method,
          url: urlForEvent,
          status: res.status,
          durationMs,
          success: true
        });
        this.emit({
          name: "api_request",
          ...event
        });
        return res;
      } catch (e) {
        const durationMs = now() - start;
        const event = this.applyNetworkRedaction({
          method,
          url: urlForEvent,
          durationMs,
          success: false,
          errorMessage: e instanceof Error ? e.message : String(e)
        });
        this.emit({
          name: "api_request",
          ...event
        });
        throw e;
      }
    };
    this.fetchPatched = true;
  }
  restoreFetch() {
    if (!this.fetchPatched || !this.originalFetch) return;
    globalThis.fetch = this.originalFetch;
    this.fetchPatched = false;
    this.originalFetch = void 0;
  }
  applyNetworkRedaction(event) {
    if (!this.config.redactNetworkEvent) return event;
    const redacted = this.config.redactNetworkEvent(event);
    return { ...event, ...redacted };
  }
};

// src/transports/console-transport.ts
function createConsoleTransport(options = {}) {
  const label = options.label ?? "AppDoctor";
  const slowScreenThresholdMs = options.slowScreenThresholdMs ?? 1e3;
  const slowApiThresholdMs = options.slowApiThresholdMs ?? 800;
  const format = options.format ?? "pretty";
  function toHint(event) {
    if (event.name === "screen_load" && event.phase === "ready" && event.durationMs >= slowScreenThresholdMs) {
      return `Slow screen "${event.screen}" (${event.durationMs}ms). Check expensive effects and repeated renders.`;
    }
    if (event.name === "api_request" && event.durationMs >= slowApiThresholdMs) {
      return `Slow API "${event.method} ${event.url}" (${event.durationMs}ms). Check server latency, payload size, and retry loops.`;
    }
    return void 0;
  }
  function toPrettyLine(event) {
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
    send(events) {
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
    }
  };
}

// src/transports/http-transport.ts
async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}
function createHttpTransport(options) {
  const maxRetries = options.maxRetries ?? 3;
  const initialBackoffMs = options.initialBackoffMs ?? 500;
  return {
    async send(events) {
      if (events.length === 0) return;
      const body = {
        events: [...events],
        ...options.getExtraBody?.() ?? {}
      };
      let attempt = 0;
      let backoff = initialBackoffMs;
      for (; ; ) {
        try {
          const res = await fetch(options.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...options.headers
            },
            body: JSON.stringify(body)
          });
          if (res.ok) return;
          if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            return;
          }
        } catch {
        }
        attempt += 1;
        if (attempt > maxRetries) return;
        await sleep(backoff);
        backoff *= 2;
      }
    }
  };
}

// src/navigation/route-name.ts
function getActiveRouteName(state) {
  if (!state || typeof state !== "object") return void 0;
  const s = state;
  if (!Array.isArray(s.routes) || typeof s.index !== "number") return void 0;
  const route = s.routes[s.index];
  if (!route || typeof route !== "object") return void 0;
  if (route.state !== void 0) return getActiveRouteName(route.state);
  return typeof route.name === "string" ? route.name : void 0;
}

// src/navigation/create-navigation-listener.ts
function createNavigationStateListener(client) {
  const timing = {};
  return {
    listener(state) {
      const screen = getActiveRouteName(state);
      if (!screen || screen === timing.lastScreen) return;
      timing.lastScreen = screen;
      const startedAt = Date.now();
      client.emit({
        name: "screen_load",
        screen,
        phase: "start",
        durationMs: 0
      });
      queueMicrotask(() => {
        if (timing.lastScreen !== screen) return;
        client.emit({
          name: "screen_load",
          screen,
          phase: "ready",
          durationMs: Date.now() - startedAt
        });
      });
    },
    reset() {
      timing.lastScreen = void 0;
    }
  };
}

// src/network/axios-instrumentation.ts
function getConfig(errorOrResponse) {
  if (!errorOrResponse || typeof errorOrResponse !== "object") return void 0;
  if ("config" in errorOrResponse && errorOrResponse.config && typeof errorOrResponse.config === "object") {
    return errorOrResponse.config;
  }
  return void 0;
}
function getResponseMeta(response) {
  if (!response || typeof response !== "object") return {};
  const r = response;
  const status = "status" in r && typeof r.status === "number" ? r.status : void 0;
  const rawConfig = "config" in r ? r.config : void 0;
  let method;
  let url;
  if (rawConfig !== null && typeof rawConfig === "object") {
    if ("method" in rawConfig && typeof rawConfig.method === "string") {
      method = rawConfig.method;
    }
    if ("url" in rawConfig && typeof rawConfig.url === "string") {
      url = rawConfig.url;
    }
  }
  return {
    status,
    method,
    url
  };
}
function instrumentAxios(axios, client, options = {}) {
  function applyRedaction(event) {
    const redacted = options.redactNetworkEvent?.(event);
    return redacted ? { ...event, ...redacted } : event;
  }
  const starts = /* @__PURE__ */ new WeakMap();
  const reqId = axios.interceptors.request.use((config) => {
    if (config !== null && typeof config === "object") {
      starts.set(config, Date.now());
    }
    return config;
  });
  const resId = axios.interceptors.response.use(
    (response) => {
      const cfg = getConfig(response);
      if (cfg !== null && typeof cfg === "object") {
        const start = starts.get(cfg);
        if (start !== void 0) {
          const { status, method, url } = getResponseMeta(response);
          const event = applyRedaction({
            method: (method ?? "GET").toUpperCase(),
            url: url ?? "",
            status,
            durationMs: Date.now() - start,
            success: true
          });
          client.emit({
            name: "api_request",
            ...event
          });
          starts.delete(cfg);
        }
      }
      return response;
    },
    (error) => {
      const cfg = getConfig(error);
      if (cfg !== null && typeof cfg === "object") {
        const start = starts.get(cfg);
        if (start !== void 0) {
          let method = "GET";
          let url = "";
          let status;
          let errorMessage = String(error);
          if (error !== null && typeof error === "object") {
            if ("message" in error && typeof error.message === "string") {
              errorMessage = error.message;
            }
            const resp = "response" in error && error.response !== null && typeof error.response === "object" ? error.response : void 0;
            if (resp && "status" in resp && typeof resp.status === "number") {
              status = resp.status;
            }
            const errCfg = "config" in error && error.config !== null && typeof error.config === "object" ? error.config : void 0;
            if (errCfg) {
              if ("method" in errCfg && typeof errCfg.method === "string") {
                method = errCfg.method.toUpperCase();
              }
              if ("url" in errCfg && typeof errCfg.url === "string") {
                url = errCfg.url;
              }
            }
          }
          const event = applyRedaction({
            method,
            url,
            status,
            durationMs: Date.now() - start,
            success: false,
            errorMessage
          });
          client.emit({
            name: "api_request",
            ...event
          });
          starts.delete(cfg);
        }
      }
      const rejectReason = error instanceof Error ? error : new Error(String(error));
      return Promise.reject(rejectReason);
    }
  );
  return () => {
    axios.interceptors.request.eject(reqId);
    axios.interceptors.response.eject(resId);
  };
}

// src/utils/track-api.ts
async function trackApi(client, label, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    client.emit({
      name: "api_request",
      method: "TRACK",
      url: label,
      status: 200,
      durationMs: Date.now() - start,
      success: true
    });
    return result;
  } catch (e) {
    client.emit({
      name: "api_request",
      method: "TRACK",
      url: label,
      durationMs: Date.now() - start,
      success: false,
      errorMessage: e instanceof Error ? e.message : String(e)
    });
    throw e;
  }
}
var AppDoctorContext = react.createContext(null);
function AppDoctorProvider({
  children,
  ...config
}) {
  const clientRef = react.useRef(null);
  if (!clientRef.current) {
    clientRef.current = new AppDoctorClient(config);
  }
  const {
    enabled,
    noop,
    sampleRate,
    flushIntervalMs,
    maxQueueSize,
    instrumentFetch,
    tags,
    context,
    transports,
    redactNetworkEvent
  } = config;
  react.useEffect(() => {
    clientRef.current?.updateConfig({
      enabled,
      noop,
      sampleRate,
      flushIntervalMs,
      maxQueueSize,
      instrumentFetch,
      tags,
      context,
      transports,
      redactNetworkEvent
    });
  }, [
    enabled,
    noop,
    sampleRate,
    flushIntervalMs,
    maxQueueSize,
    instrumentFetch,
    tags,
    context,
    transports,
    redactNetworkEvent
  ]);
  react.useEffect(() => {
    return () => {
      void clientRef.current?.shutdown();
      clientRef.current = null;
    };
  }, []);
  return /* @__PURE__ */ jsxRuntime.jsx(AppDoctorContext.Provider, { value: clientRef.current, children });
}
function useAppDoctor() {
  const client = react.useContext(AppDoctorContext);
  if (!client) {
    throw new Error("useAppDoctor must be used within AppDoctorProvider");
  }
  return client;
}
function useTrackScreen(screen, options = {}) {
  const fromContext = react.useContext(AppDoctorContext);
  const client = options.client ?? fromContext;
  if (!client) {
    throw new Error(
      "useTrackScreen requires AppDoctorProvider or options.client"
    );
  }
  react.useEffect(() => {
    const startedAt = Date.now();
    client.emit({
      name: "screen_load",
      screen,
      phase: "start",
      durationMs: 0
    });
    queueMicrotask(() => {
      client.emit({
        name: "screen_load",
        screen,
        phase: "ready",
        durationMs: Date.now() - startedAt
      });
    });
  }, [client, screen]);
}
function useTrackRender(componentName, options = {}) {
  const fromContext = react.useContext(AppDoctorContext);
  const client = options.client ?? fromContext;
  if (!client) {
    throw new Error(
      "useTrackRender requires AppDoctorProvider or options.client"
    );
  }
  const every = options.every ?? 10;
  const count = react.useRef(0);
  count.current += 1;
  react.useEffect(() => {
    if (count.current % every !== 0) return;
    client.emit({
      name: "render_event",
      component: componentName,
      renderCount: count.current
    });
  });
}

exports.AppDoctorClient = AppDoctorClient;
exports.AppDoctorContext = AppDoctorContext;
exports.AppDoctorProvider = AppDoctorProvider;
exports.createConsoleTransport = createConsoleTransport;
exports.createHttpTransport = createHttpTransport;
exports.createNavigationStateListener = createNavigationStateListener;
exports.getActiveRouteName = getActiveRouteName;
exports.instrumentAxios = instrumentAxios;
exports.shouldSample = shouldSample;
exports.trackApi = trackApi;
exports.useAppDoctor = useAppDoctor;
exports.useTrackRender = useTrackRender;
exports.useTrackScreen = useTrackScreen;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map