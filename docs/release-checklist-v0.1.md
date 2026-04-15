# v0.1 release checklist

Use this checklist before publishing App Doctor v0.1.

## Quality gates

- [ ] `npm test` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` succeeds and `dist/` artifacts are generated.

## MVP capability checks

- [ ] `screen_load` events are emitted with `phase: start` and `phase: ready`.
- [ ] `api_request` events are emitted for fetch requests (success and failure paths).
- [ ] Axios instrumentation emits `api_request` and interceptor cleanup works.
- [ ] Console transport prints batches and warns for slow screens/APIs.
- [ ] HTTP transport sends batched payloads and retries transient failures.

## Safety and privacy

- [ ] `noop` mode disables capture and dispatch.
- [ ] `sampleRate` is documented and validated in runtime behavior.
- [ ] `redactNetworkEvent` examples are documented.
- [ ] Default tags/context do not include secrets.

## Docs and adoption

- [ ] Quickstart works end-to-end in under five minutes.
- [ ] README links and API references are accurate.
- [ ] Known limitations are documented (no dashboard/aggregation in v0.1).
