---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector-go': patch
---

The generated metadata now says how things are reached. Each CLI program lists its `entrypoints` from `cli.entrypoints` in pikku.config: `{ type: 'local' }` for a CLI that runs the app in-process, `{ type: 'channel', channel, route }` for one that talks to a running app, with the same default name (`<program>-cli`) and route (`<globalHTTPPrefix>/cli/<program>`) the generated channel registers. A webhook source with `verify` records it as `verify: { kind, header?, algorithm? }` (`hmac`, `token`, `publicKey` or `function`; header and algorithm only when written as string literals) beside the `credential` that holds its secret. A channel CLI client generated without a configured `route` now connects to the prefixed route its channel is registered on.
