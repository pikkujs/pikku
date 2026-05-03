# @pikku/react

## 0.12.2

### Patch Changes

- f72a820: feat: realtime events — `/events` channel, SSE, typed `PikkuRealtime` client
  - New `pikku realtime` CLI command generates a `PikkuRealtime` client
    that mirrors `PikkuRPC` and shares the project's `PikkuFetch` for
    server URL + auth.
  - `pikku events` scaffold (gated by `scaffold.events` in
    `pikku.config.json`) emits a `/events` WebSocket channel + a
    per-topic SSE route that fan out via the `eventHub` service.
  - React provider exposes `PikkuRealtime` alongside `PikkuRPC`.
  - `pikku dev` now wires `LocalEventHubService` so realtime works
    out of the box in local dev.
  - `subscribeToSSE` uses fetch-streaming (instead of native
    `EventSource`) so it can send the JWT/API-key headers that
    `PikkuFetch` already manages.

- Updated dependencies [f72a820]
  - @pikku/fetch@0.12.2

## 0.12.1

### Patch Changes

- Fix `@pikku/fetch` dependency to use npm version range instead of workspace protocol.

## 0.12.0

### Minor Changes

- React bindings for Pikku: `PikkuProvider`, `usePikkuFetch`, `usePikkuRPC`, and `createPikku` helper.
