---
'@pikku/inspector': patch
'@pikku/cli': patch
---

Stop consumed-addon parent services from polluting every per-unit deploy bundle, and stub the AI SDKs out of non-agent units.

`aggregateRequiredServices` added `addonRequiredParentServices` (the services a consumed addon needs from its parent — e.g. `aiAgentRunner`, `deploymentService`, `metaService`) to **every** unit's `requiredServices` unconditionally. For any project that consumes an addon, this marked those services required on all units, so the per-unit service tree-shaking (and the gen-file/module stubs that key off the `false` flags) never fired — every unit shipped the full set. These parent services are now added only to units that actually deploy an addon function (its `pikkuFuncId` appears in `usedFunctions`); a unit that only calls the addon over RPC, or never touches it, no longer carries them.

On the back of the now-honest flags, the bundler stubs the AI SDK packages (`@pikku/ai-vercel`, `@ai-sdk/*`, `ai`) out of any unit where `aiAgentRunner` is not required, via a new service→module stub map alongside the existing gen-file stub map. The shared services factory must guard runner construction behind a defined-check on the dynamic import so a stubbed unit simply skips building the runner.
