---
'@pikku/cli': patch
---

Stop stubbing the AI SDKs out of units that wire `ai` rather than `agentRunner`.

Two names reach a model. `agentRunner` is the core `AgentRunnerService` that runs
declared agents; `ai` is not a core service at all, but the conventional name for
an app's own model wrapper. The deploy analyzer has always known both —
`SERVICE_CAPABILITY_MAP` grants `ai-model` to each — while `SERVICE_MODULE_MAP`
listed only `agentRunner`, and the stub pass read only the services marked
`false`.

A unit that destructured `ai` therefore got the model capability and had
`@pikku/ai-vercel`, `@ai-sdk/*` and `ai` replaced with `export {}` in the same
build, because its generated services report `'agentRunner': false` on the line
above `'ai': true`. That is not a smaller bundle, it is a broken one: a unit
asking for a model does import those packages, so every such unit failed with
`No matching export in "pikku-stub:@pikku/ai-vercel" for import
"VercelAgentRunner"` and the deploy died with nine bundle failures.

The stub decision now spans all the services in the file: a module set is dead
only when no required service claims it. `ai` is listed alongside `agentRunner`
and shares its pattern array, so the two are identity-equal and either one keeps
the SDKs. Services that front nothing else — `metaService` and its gen file — are
unaffected.

This only became reachable when an app renamed a model-bearing service to `ai`.
Before that the capability was never granted, the SDKs were correctly stubbed,
and the symptom was the opposite one: a runner that was never constructed.
