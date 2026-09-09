---
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/deploy': patch
'@pikku/deploy-cloudflare': patch
'@pikku/core': patch
---

An addon's exposed functions get their own deployment unit

`collectFilterNames` adds the `/rpc/:rpcName` scaffold name to every unit holding an exposed function, so that unit can serve its own `/rpc/<funcName>`. `filterInspectorState` read that same string back as "this unit is the generic dispatcher" and kept every wired addon's declaration for it, so almost every function unit imported each addon's whole package bootstrap — and the node-only modules it reaches.

No unit retains a wired addon on the strength of a catch-all route any more. Instead the analyzer emits a unit per addon carrying that addon's exposed functions, and the unit serving `/rpc/:rpcName` dispatches to it over a service binding rather than bundling it. Granularity is per addon rather than per function because an addon publishes a single prebuilt bootstrap that registers all of its functions at once.

`node:child_process` joins `node:fs` as a stubbed builtin: Workers have no implementation of it under any compatibility flag, and it is reached from the console addon's audit tooling.

`DeploymentUnit` gains `dispatch`, an RPC-name → unit-name map for calls whose target unit isn't the kebab-cased RPC name. `rpc.exposed(name)` falls through to the deployment service for a namespaced name with no local metadata, and Cloudflare function units with a `dependsOn` now get a `deploymentService`, which previously only gateway units had.
