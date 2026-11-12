---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector-go': patch
---

The generated metadata now says how things are reached. Each CLI program lists its `entrypoints` from `cli.entrypoints` in pikku.config: `{ type: 'local' }` for a CLI that runs the app in-process, `{ type: 'channel', channel, route }` for one that talks to a running app, with the same default name (`<program>-cli`) and route (`<globalHTTPPrefix>/cli/<program>`) the generated channel registers. A webhook source with `verify`, written out or as a shorthand `verify,`, records it as `verify: { kind, header?, algorithm? }` (`hmac`, `token`, `publicKey` or `function`; header and algorithm only when written as string literals) beside the `credential` that holds its secret. A shorthand `verify,` now also declares that secret credential, which it previously skipped. Behaviour change for apps that set `globalHTTPPrefix`: a channel CLI client generated without a configured `route` now connects to `<globalHTTPPrefix>/cli/<program>`, the route its channel is registered on. It previously left the prefix out and connected to the wrong URL. Apps without `globalHTTPPrefix`, or with an explicit `route`, are unaffected.
