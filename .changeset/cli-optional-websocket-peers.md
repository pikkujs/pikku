---
'@pikku/cli': patch
---

Make `@pikku/ws` and `ws` optional peer dependencies instead of dependencies, and resolve them from the project rather than from the CLI.

`@pikku/ws` peers on a `@pikku/core` range, so a copy sitting in the CLI's own tree gets paired with the CLI's core rather than the project's — the skew surfaced as `Cannot find module '@pikku/core/ecosystem'` from a package the project never imported. As an optional peer resolved against the project's `package.json`, there is one core in play, and a Bun project (which serves WebSockets natively through `@pikku/bun-server`) no longer installs a Node WebSocket stack it cannot use.

`pikku dev` and `pikku serve` under Node now start over plain HTTP when the packages are absent, logging why, and `pikku validate` reports `websocket-deps-missing` as an error for a project that wires channels without them.
