---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/addon-admin': patch
---

Webhook trigger sources are off until someone turns them on, and addons declare their own.

An addon calls `wireTriggerWebhookSource` in its own package, and an app that wires the addon gets the source (its route included) without declaring it: named and routed after the addon's namespace, so two instances get one each. A source the app declares under the same name wins.

Every source now has an `enabled` switch in the `triggerSourceStore`, off by default. `reconcileTriggerSources` registers only enabled sources and records each one's `baseUrl` and `labelPrefix`; a disabled source's route answers 404 without running `receive`. New in core: `enableTriggerSource` registers a source with its provider and `disableTriggerSource` stops it receiving, then tears it down, both at the recorded address unless one is given. The admin addon exposes them as `triggerSourceEnable` and `triggerSourceDisable`. The `pikkuTriggerSource` table gains `enabled`, `baseUrl` and `labelPrefix`: run `pikku db generate` for the migration.
