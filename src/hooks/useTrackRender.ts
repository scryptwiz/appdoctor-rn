import { useContext, useEffect, useRef } from "react";
import type { AppDoctorClient } from "../core/client.js";
import { AppDoctorContext } from "../provider/context.js";

export interface UseTrackRenderOptions {
  client?: AppDoctorClient;
  /** Emit every N renders (default 10) to limit noise */
  every?: number;
}

/**
 * Emits `render_event` periodically when the component re-renders.
 */
export function useTrackRender(
  componentName: string,
  options: UseTrackRenderOptions = {},
): void {
  const fromContext = useContext(AppDoctorContext);
  const client = options.client ?? fromContext;
  if (!client) {
    throw new Error(
      "useTrackRender requires AppDoctorProvider or options.client",
    );
  }
  const every = options.every ?? 10;
  const count = useRef(0);

  count.current += 1;

  useEffect(() => {
    if (count.current % every !== 0) return;
    client.emit({
      name: "render_event",
      component: componentName,
      renderCount: count.current,
    });
  });
}
