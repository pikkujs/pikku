---
'@pikku/cli': patch
---

Add `deploy.grouping` to `pikku.config.json`, deciding how many deployment units an app's functions collapse into.

`strategy` sets what happens to a function no rule matches — `function` (the default, and today's behaviour) gives it its own unit, `single` puts it in one shared unit. `rules` are evaluated in order, first match wins, matching on `tags`, `addon` or `routes` globs. Under `function` a rule merges functions together; under `single` it carves them out.

Functions whose deploy target differs cannot share a unit, and the build fails naming them rather than promoting one to `server`.
