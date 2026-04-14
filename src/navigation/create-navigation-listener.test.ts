import { describe, expect, it } from "vitest";
import type { AppDoctorEvent } from "../core/types.js";
import { AppDoctorClient } from "../core/client.js";
import { createNavigationStateListener } from "./create-navigation-listener.js";

function waitMicrotask(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

describe("createNavigationStateListener", () => {
  it("emits screen_load start and ready events", async () => {
    const events: AppDoctorEvent[] = [];
    const client = new AppDoctorClient({
      transports: [
        {
          send(batch) {
            events.push(...batch);
          },
        },
      ],
      instrumentFetch: false,
      flushIntervalMs: 999999,
    });

    const { listener } = createNavigationStateListener(client);
    listener({
      routes: [{ name: "Home" }],
      index: 0,
    });
    await waitMicrotask();
    await client.flush();

    const screenEvents = events.filter((event) => event.name === "screen_load");
    expect(screenEvents).toHaveLength(2);
    expect(screenEvents[0] && "phase" in screenEvents[0] ? screenEvents[0].phase : "").toBe("start");
    expect(screenEvents[1] && "phase" in screenEvents[1] ? screenEvents[1].phase : "").toBe("ready");
    await client.shutdown();
  });
});
