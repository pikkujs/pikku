---
'@pikku/core': patch
'@pikku/better-auth': patch
'@pikku/cli': patch
---

Provision the declared personas from the fabric plugin instead of the server lifecycle.

`provisionPersonas` was documented as a call an app makes from `pikkuServerLifecycle`'s `afterStart`. That hook is invoked by `pikku serve` and `pikku dev` and by nothing else — no deploy runtime calls it — so on any stage deployed to Workers or a serverless target the provisioning never ran, and every persona signed in holding no roles.

`pikkuFabric` now takes `personas`. The operator endpoint resolves the address the caller wants to act as; a miss provisions the declaration and looks again. On a stage that already holds the persona that is one query, and the pass only runs when there is genuinely something absent to create.

Sign-in no longer creates accounts of its own. `OperatorSignInOptions.createMissing` and `PIKKU_PERSONA_CREATE_MISSING` are gone, and an address no declaration claims stays a 404 however many times it is asked for. `provisionPersonas` is no longer exported — the plugin is the only caller.

`pikku persona sync <environment>` is unchanged: it still reports who an environment will provision and why anyone was skipped, and still writes nothing.
