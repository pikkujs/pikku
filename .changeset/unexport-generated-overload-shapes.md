---
'@pikku/cli': patch
---

Stop exporting overload-parameter shapes from generated types

Types such as `PikkuFunctionConfigWithSchema`, `PikkuAuthConfig` and
`TriggerWiring` exist only to name the `config` argument inside an overload
signature. Exporting them made them part of what an app can import from
`#pikku` — a compatibility promise with no consumer.

The channel, cli, http, mcp, queue and scheduler templates already kept theirs
internal; the function, trigger and workflow templates now do the same.
`pikkuVoidFunc` gains the explicit `PikkuFunctionConfig` return type its
sibling factories already declare, so its inferred type stays nameable.
