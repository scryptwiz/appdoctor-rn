import { describe, expect, it } from "vitest";
import { AppDoctorClient } from "./client.js";

describe("AppDoctorClient performance budget (smoke)", () => {
  it("enqueues many events quickly", () => {
    const client = new AppDoctorClient({
      instrumentFetch: false,
      flushIntervalMs: 999999,
      maxQueueSize: 50_000,
    });
    const start = performance.now();
    for (let i = 0; i < 5000; i += 1) {
      client.emit({
        name: "screen_load",
        screen: `S${i}`,
        phase: "start",
        durationMs: 0,
      });
    }
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(200);
    void client.shutdown();
  });
});
