import { describe, expect, it, vi } from "vitest";
import type { AppDoctorEvent, Transport } from "./types.js";
import { AppDoctorClient } from "./client.js";

function collectTransport(): Transport & { events: AppDoctorEvent[] } {
  const events: AppDoctorEvent[] = [];
  return {
    events,
    send(batch: readonly AppDoctorEvent[]) {
      events.push(...batch);
    },
  };
}

describe("AppDoctorClient", () => {
  it("drops oldest when queue exceeds maxQueueSize", async () => {
    const t = collectTransport();
    const client = new AppDoctorClient({
      transports: [t],
      maxQueueSize: 2,
      instrumentFetch: false,
      flushIntervalMs: 999999,
    });
    client.emit({
      name: "screen_load",
      screen: "A",
      phase: "start",
      durationMs: 0,
    });
    client.emit({
      name: "screen_load",
      screen: "B",
      phase: "start",
      durationMs: 0,
    });
    client.emit({
      name: "screen_load",
      screen: "C",
      phase: "start",
      durationMs: 0,
    });
    await client.flush();
    expect(t.events.map((e) => (e as { screen: string }).screen)).toEqual([
      "B",
      "C",
    ]);
    await client.shutdown();
  });

  it("flush delivers to transports", async () => {
    const t = collectTransport();
    const client = new AppDoctorClient({
      transports: [t],
      instrumentFetch: false,
      flushIntervalMs: 999999,
    });
    client.emit({
      name: "api_request",
      method: "GET",
      url: "https://example.com",
      durationMs: 12,
      success: true,
    });
    await client.flush();
    expect(t.events).toHaveLength(1);
    expect(t.events[0]?.name).toBe("api_request");
    await client.shutdown();
  });

  it("instruments fetch when enabled", async () => {
    const t = collectTransport();
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response("ok", { status: 200 })),
    ) as typeof fetch;

    const client = new AppDoctorClient({
      transports: [t],
      instrumentFetch: true,
      flushIntervalMs: 999999,
    });

    await globalThis.fetch("https://example.com/api");
    await client.flush();

    expect(t.events.some((e) => e.name === "api_request")).toBe(true);
    await client.shutdown();
    globalThis.fetch = original;
  });

  it("supports noop mode", async () => {
    const t = collectTransport();
    const client = new AppDoctorClient({
      transports: [t],
      noop: true,
      instrumentFetch: false,
      flushIntervalMs: 999999,
    });
    client.emit({
      name: "screen_load",
      screen: "NoopScreen",
      phase: "start",
      durationMs: 0,
    });
    await client.flush();
    expect(t.events).toHaveLength(0);
    await client.shutdown();
  });

  it("continues flushing when a transport throws", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const sent: AppDoctorEvent[] = [];
      const failing: Transport = {
        send() {
          throw new Error("transport failed");
        },
      };
      const healthy: Transport = {
        send(events) {
          sent.push(...events);
        },
      };
      const client = new AppDoctorClient({
        transports: [failing, healthy],
        instrumentFetch: false,
        flushIntervalMs: 999999,
      });
      client.emit({
        name: "screen_load",
        screen: "Resilient",
        phase: "start",
        durationMs: 0,
      });
      await client.flush();
      expect(sent).toHaveLength(1);
      expect(warnSpy).toHaveBeenCalled();
      await client.shutdown();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("applies redactNetworkEvent for fetch events", async () => {
    const t = collectTransport();
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response("ok", { status: 200 })),
    ) as typeof fetch;
    const client = new AppDoctorClient({
      transports: [t],
      instrumentFetch: true,
      flushIntervalMs: 999999,
      redactNetworkEvent(event) {
        return {
          ...event,
          url: "[redacted]",
        };
      },
    });

    await globalThis.fetch("https://example.com/private");
    await client.flush();
    const networkEvent = t.events.find((event) => event.name === "api_request");
    expect(networkEvent).toBeDefined();
    expect(networkEvent && "url" in networkEvent ? networkEvent.url : "").toBe(
      "[redacted]",
    );
    await client.shutdown();
    globalThis.fetch = original;
  });
});
