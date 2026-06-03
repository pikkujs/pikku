# @pikku/react

## 0.12.2

### Patch Changes

- 9060165: New realtime events system: `pikku realtime` generates a typed `PikkuRealtime` client that pairs with `PikkuRPC`. A `/events` channel can be scaffolded to fan out server events to subscribers over SSE. `pikku dev` wires `LocalEventHubService` automatically so realtime works out of the box locally. The React provider exposes `PikkuRealtime` alongside `PikkuRPC`.
- Updated dependencies [9060165]
- Updated dependencies [9060165]
  - @pikku/fetch@0.12.2

## 0.12.1

### Patch Changes

- Fix `@pikku/fetch` dependency to use npm version range instead of workspace protocol.

## 0.12.0

### Minor Changes

- React bindings for Pikku: `PikkuProvider`, `usePikkuFetch`, `usePikkuRPC`, and `createPikku` helper.
