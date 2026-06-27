---
'@pikku/deploy-standalone': patch
'@pikku/bun-server': patch
'@pikku/cli': patch
---

feat(deploy): standalone provider can target the bun runtime

`pikku deploy plan|apply --provider standalone --runtime bun` now generates a
`@pikku/bun-server` entry (native `Bun.serve` WebSockets, no `ws` package) and
compiles the bundle into a single self-contained executable via
`bun build --compile` — no runtime needed on the target host. The default
remains `--runtime node`, which is unchanged (ships `bundle.js`, run with
`node bundle.js`).

`PikkuBunServer` now accepts an injectable `eventHub` in its options. Inject the
same `BunEventHubService` you pass to `createSingletonServices` so functions and
the WebSocket transport share one hub — otherwise a function's
`eventHub.publish(...)` targets a different hub than the one holding the live
sockets and broadcasts never reach connected clients. The standalone bun entry
and the `bun` template now wire this shared hub, fixing cross-connection /
cross-transport channel pub-sub on bun.

Also removes the unused `@yao-pkg/pkg` dependency and its stale type shim from
`@pikku/deploy-standalone` (the pkg-based binary path was dropped in #489).
