---
'@pikku/cli': patch
'@pikku/deploy-standalone': patch
---

A trigger source store is now provided wherever an app runs: `pikku dev`, `pikku serve`, generated local services and the standalone deploy entry. Apps with a database get the Kysely store, falling back to memory when its table is not migrated yet. The admin addon's trigger-source functions and the webhook source runner no longer throw `No triggerSourceStore is configured`.
