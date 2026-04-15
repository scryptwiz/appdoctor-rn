# Performance budget

App Doctor is meant to stay cheap enough for production. These are **guidelines** for this package; tune for your app if you emit very high event volume.

## Targets

- **Enqueue path**: emitting an event should remain **O(1)** and avoid heavy serialization. The client stores objects in an in-memory queue until flush.
- **Queue**: bounded by `maxQueueSize` (default **200**). When full, the **oldest** event is dropped to cap memory.
- **Flush**: runs on an interval (`flushIntervalMs`, default **2000 ms**) and on `shutdown()`. Transports run in parallel; a failing transport does not crash the app (warnings may appear in dev).
- **Fetch patching**: optional; restored on `shutdown()`. Disable with `instrumentFetch: false` if you measure network another way.

## CI smoke test

`src/core/client.perf.test.ts` enqueues **5000** `screen_load` events and expects wall time under **200 ms** in Vitest (Node). This is a coarse regression guard, not a substitute for profiling in a real React Native build.

## Recommendations

- Use `sampleRate < 1` in production if volume is high.
- Prefer **batched HTTP** transport with modest flush intervals rather than per-event network calls.
- Keep **tags** small (short string values) to limit payload size.

## Future work

JS thread long-task detection and richer render attribution will add cost; future versions should document updated budgets and offer toggles.