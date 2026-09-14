---
'@pikku/cli': patch
---

fabric login and fabric changes run outside a pikku project, and a missing config says what to do

Neither command reads `pikku.config.json` — `changesContext` resolves the api url, bearer and project from `pikkufabric.config.json` or `--project-id`, and you log in before there is a project to be inside. Both were still gated on a config being found, so a harness emptying the change queue from anywhere but a linked checkout died before its function ran.

The refusal itself is now a `PikkuError`, so "no pikku.config.json here" prints as the single line it is, naming the directory searched and the `--config` flag, rather than a stack trace through the loader.
