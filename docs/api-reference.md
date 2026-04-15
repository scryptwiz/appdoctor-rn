# API reference

Types are exported from the package entry; this page summarizes the public surface.

## Provider and context

### `AppDoctorProvider`

React provider. Accepts all fields from `AppDoctorConfig` plus `children`.

### `useAppDoctor()`

Returns the `AppDoctorClient` from context. Throws if used outside `AppDoctorProvider`.

### `AppDoctorContext`

Low-level context if you prefer not to use the hook.

## Client

### `AppDoctorClient`

Constructed internally by the provider. Useful for advanced setups (e.g. passing the same instance to `instrumentAxios`).

- `emit(event)` — enqueue a typed event (subject to `enabled`, `noop`, and `sampleRate`).
- `flush()` — send queued events to all transports.
- `shutdown()` — stop timers, restore patched `fetch`, flush, then call `shutdown` on transports that define it.
- `addTransport(transport)` — append a transport at runtime.
- `updateConfig(partial)` — update options after mount.
- `captureError(message, context?, err?)` — emit `sdk_error`.

### `AppDoctorConfig`


| Field             | Type                     | Default | Description                             |
| ----------------- | ------------------------ | ------- | --------------------------------------- |
| `enabled`         | `boolean`                | `true`  | Master switch                           |
| `noop`            | `boolean`                | `false` | Skip all SDK work with integration intact |
| `sampleRate`      | `number` (0–1)           | `1`     | Random sampling for `emit`              |
| `flushIntervalMs` | `number`                 | `2000`  | Periodic flush interval                 |
| `maxQueueSize`    | `number`                 | `200`   | Bounded queue; oldest dropped when full |
| `transports`      | `Transport[]`            | `[]`    | Sinks for batched events                |
| `tags`            | `Record<string, string>` | —       | Merged onto every event                 |
| `context`         | `EventContext`           | —       | Attached to every emitted event         |
| `instrumentFetch` | `boolean`                | `true`  | Patch global `fetch` for timing         |
| `redactNetworkEvent` | `function`           | —       | Redact/sanitize outgoing `api_request` fields |


## Events (`AppDoctorEvent`)


| `name`          | Meaning |
| --------------- | ------- |
| `screen_load`   | Screen lifecycle events (`phase: start | ready`) |
| `api_request`   | Completed or failed HTTP call (fetch, Axios, or manual wrapper) |
| `render_event`  | Optional render diagnostics from `useTrackRender` |
| `sdk_error`     | Internal or integration error |


## Transports

### `createConsoleTransport({ label? })`

Logs batches with `console.log`; warns on slow screens/APIs by threshold.

### `createHttpTransport({ url, headers?, maxRetries?, initialBackoffMs?, getExtraBody? })`

`POST`s JSON. Retries on network errors and 5xx; skips retry for most 4xx (except 429).

### `Transport`

```ts
interface Transport {
  send(events: readonly AppDoctorEvent[]): void | Promise<void>;
  flush?: () => void | Promise<void>;
  shutdown?: () => void | Promise<void>;
}
```

## Navigation helpers

### `createNavigationStateListener(client)`

Returns `{ listener, reset }`. Pass `listener` to `NavigationContainer` `onStateChange`.

### `getActiveRouteName(state)`

Utility to read the deepest focused route name from a navigation state object.

## Network

### `instrumentAxios(axios, client, options?)`

Installs request/response interceptors; returns `eject` to remove them. Works with a minimal `AxiosLike` type so `axios` does not need to be a direct dependency of the SDK. `options.redactNetworkEvent` lets you sanitize URL or other fields before emit.

## Hooks and utilities

### `useTrackScreen(screen, { client? })`

Emits `screen_load` start/ready when the component mounts (for non-navigation screens or modals).

### `useTrackRender(componentName, { client?, logEvery? })`

Increments a render counter and emits `render_event` when the count is a multiple of `every`.

### `trackApi(name, fn)`

Wraps an async function to time it and emit `api_request` metadata (manual API labeling).

## Other exports

- `shouldSample(rate)` — sampling helper used internally; exposed for tests or custom pipelines.

