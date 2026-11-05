---
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/core': patch
---

`pikku doc` now answers more from one call. `TypedWorkflow.do` and the `func`, `input`, `output` and `permissions` keys of function factories are listed, because the surface keeps documented keys of generated files. `WorkflowApprovalOptions`, `ApprovalOutcome`, `WorkflowStepOptions`, `ListInput`, `ListOutput`, `Filter` and `defineVirtualUsers` are reachable from their barrels. New doors cover `@pikku/react` and core exports with no barrel: `PikkuWire`, `telemetryOuter`/`telemetryInner`, `definePlugin`, outgoing webhooks, `EmailService` and `EventHubService`. Corrected the `wireAddon` `tags` doc, which is added to function tags at runtime, and the online-shop `limit` cap.
