import { useContext, useEffect } from "react";
import type { AppDoctorClient } from "../core/client.js";
import { AppDoctorContext } from "../provider/context.js";

export interface UseTrackScreenOptions {
  client?: AppDoctorClient;
}

/**
 * Emits `screen_load` lifecycle events on mount and ready.
 */
export function useTrackScreen(
  screen: string,
  options: UseTrackScreenOptions = {},
): void {
  const fromContext = useContext(AppDoctorContext);
  const client = options.client ?? fromContext;
  if (!client) {
    throw new Error(
      "useTrackScreen requires AppDoctorProvider or options.client",
    );
  }

  useEffect(() => {
    const startedAt = Date.now();
    client.emit({
      name: "screen_load",
      screen,
      phase: "start",
      durationMs: 0,
    });
    queueMicrotask(() => {
      client.emit({
        name: "screen_load",
        screen,
        phase: "ready",
        durationMs: Date.now() - startedAt,
      });
    });
  }, [client, screen]);
}
