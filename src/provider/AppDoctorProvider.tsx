import { useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { AppDoctorClient } from "../core/client.js";
import type { AppDoctorConfig } from "../core/types.js";
import { AppDoctorContext } from "./context.js";

export type AppDoctorProviderProps = AppDoctorConfig & {
  children: ReactNode;
};

export function AppDoctorProvider({
  children,
  ...config
}: AppDoctorProviderProps): ReactElement {
  const clientRef = useRef<AppDoctorClient | null>(null);
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
    redactNetworkEvent,
  } = config;

  useEffect(() => {
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
      redactNetworkEvent,
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
    redactNetworkEvent,
  ]);

  useEffect(() => {
    return () => {
      void clientRef.current?.shutdown();
      clientRef.current = null;
    };
  }, []);

  return (
    <AppDoctorContext.Provider value={clientRef.current}>
      {children}
    </AppDoctorContext.Provider>
  );
}
