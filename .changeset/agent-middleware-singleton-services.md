---
'@pikku/core': patch
'@pikku/cli': patch
---

fix: hand agent middleware the singleton services its type promises

`PikkuAgentMiddlewareHooks` typed its `services` parameter as the project's full
wire `Services`, while every runtime call site has only ever passed the singleton
services. A middleware that destructured a wire service typechecked and silently
received `undefined`.

The hooks are now bounded by `CoreSingletonServices` in core, and the generated
`pikkuAgentMiddleware` defaults to `WiredSingletonServices` like the other
middleware definers. Nothing changes at runtime: agent middleware hooks a _run_,
and a run is not a request — it can start from a scheduler or a workflow with no
wire behind it. A tool the run calls is an ordinary function call and still gets
its own wire services through `runPikkuFunc`.
