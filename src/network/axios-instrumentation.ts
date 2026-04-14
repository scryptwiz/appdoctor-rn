import type { AppDoctorClient } from "../core/client.js";
import type { NetworkRequestEvent } from "../core/types.js";

/** Minimal Axios shape to avoid requiring `axios` as a dependency. */
export interface AxiosLike {
  interceptors: {
    request: {
      use: (onFulfilled: (value: unknown) => unknown) => number;
      eject: (id: number) => void;
    };
    response: {
      use: (
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (error: unknown) => unknown,
      ) => number;
      eject: (id: number) => void;
    };
  };
}

export interface AxiosInstrumentationOptions {
  redactNetworkEvent?: (
    event: Omit<NetworkRequestEvent, "timestamp" | "sessionId" | "name">,
  ) => Partial<Omit<NetworkRequestEvent, "timestamp" | "sessionId" | "name">>;
}

function getConfig(errorOrResponse: unknown): unknown {
  if (!errorOrResponse || typeof errorOrResponse !== "object") return undefined;
  if (
    "config" in errorOrResponse &&
    errorOrResponse.config &&
    typeof errorOrResponse.config === "object"
  ) {
    return errorOrResponse.config;
  }
  return undefined;
}

function getResponseMeta(response: unknown): {
  status?: number;
  method?: string;
  url?: string;
} {
  if (!response || typeof response !== "object") return {};
  const r = response;
  const status =
    "status" in r && typeof r.status === "number" ? r.status : undefined;
  const rawConfig = "config" in r ? r.config : undefined;
  let method: string | undefined;
  let url: string | undefined;
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
    url,
  };
}

/**
 * Returns an `eject` function to remove interceptors.
 */
export function instrumentAxios(
  axios: AxiosLike,
  client: AppDoctorClient,
  options: AxiosInstrumentationOptions = {},
): () => void {
  function applyRedaction(
    event: Omit<NetworkRequestEvent, "timestamp" | "sessionId" | "name">,
  ): Omit<NetworkRequestEvent, "timestamp" | "sessionId" | "name"> {
    const redacted = options.redactNetworkEvent?.(event);
    return redacted ? { ...event, ...redacted } : event;
  }

  const starts = new WeakMap<object, number>();

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
        if (start !== undefined) {
          const { status, method, url } = getResponseMeta(response);
          const event = applyRedaction({
            method: (method ?? "GET").toUpperCase(),
            url: url ?? "",
            status,
            durationMs: Date.now() - start,
            success: true,
          });
          client.emit({
            name: "api_request",
            ...event,
          });
          starts.delete(cfg);
        }
      }
      return response;
    },
    (error: unknown) => {
      const cfg = getConfig(error);
      if (cfg !== null && typeof cfg === "object") {
        const start = starts.get(cfg);
        if (start !== undefined) {
          let method = "GET";
          let url = "";
          let status: number | undefined;
          let errorMessage = String(error);
          if (error !== null && typeof error === "object") {
            if ("message" in error && typeof error.message === "string") {
              errorMessage = error.message;
            }
            const resp =
              "response" in error && error.response !== null &&
              typeof error.response === "object"
                ? error.response
                : undefined;
            if (
              resp &&
              "status" in resp &&
              typeof resp.status === "number"
            ) {
              status = resp.status;
            }
            const errCfg =
              "config" in error && error.config !== null &&
              typeof error.config === "object"
                ? error.config
                : undefined;
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
            errorMessage,
          });
          client.emit({
            name: "api_request",
            ...event,
          });
          starts.delete(cfg);
        }
      }
      const rejectReason =
        error instanceof Error ? error : new Error(String(error));
      return Promise.reject(rejectReason);
    },
  );

  return () => {
    axios.interceptors.request.eject(reqId);
    axios.interceptors.response.eject(resId);
  };
}
