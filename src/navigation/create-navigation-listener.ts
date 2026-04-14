import type { AppDoctorClient } from "../core/client.js";
import { getActiveRouteName } from "./route-name.js";

export interface NavigationTimingState {
  lastScreen?: string;
}

/**
 * Pass the returned listener to `NavigationContainer` as `onStateChange`.
 * Emits `screen_load` when the active route changes and a ready event after the next microtask
 * (approximates first paint/commit after navigation state updates).
 */
export function createNavigationStateListener(client: AppDoctorClient): {
  listener: (state: unknown) => void;
  reset: () => void;
} {
  const timing: NavigationTimingState = {};

  return {
    listener(state: unknown) {
      const screen = getActiveRouteName(state);
      if (!screen || screen === timing.lastScreen) return;

      timing.lastScreen = screen;
      const startedAt = Date.now();

      client.emit({
        name: "screen_load",
        screen,
        phase: "start",
        durationMs: 0,
      });

      queueMicrotask(() => {
        if (timing.lastScreen !== screen) return;
        client.emit({
          name: "screen_load",
          screen,
          phase: "ready",
          durationMs: Date.now() - startedAt,
        });
      });
    },
    reset() {
      timing.lastScreen = undefined;
    },
  };
}
