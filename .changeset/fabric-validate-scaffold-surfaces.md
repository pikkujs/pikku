---
'@pikku/cli': patch
---

fix(fabric-validate): require scaffold surfaces and gitignore generated artifacts

`pikku fabric validate` now checks the project's `pikku.config.json` `scaffold`
block for the public surfaces the Fabric console depends on: `console`, `rpc`,
`agent` and `workflow` are errors (each gates HTTP/RPC endpoints the console
calls directly — e.g. a missing `agent` 404s `/rpc/agent/:agentName` and a
missing `workflow` 404s `/workflow/:workflowName/start`), and `events` is a warn
(the realtime channel is feature-dependent). It also warns when `.gitignore`
does not ignore the regenerated artifacts `.opencode`, `.pikku`, `.pikku-runtime`,
`__fabric_scaffold.vite.config.mjs`, and generated files (`*.gen.*`, or the
`*.gen.ts` + `*.gen.js` pair).
