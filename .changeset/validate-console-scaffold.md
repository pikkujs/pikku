---
'@pikku/cli': patch
---

`pikku fabric validate` now flags a missing `scaffold.console` in `pikku.config.json`. Without it the console addon's introspection RPCs (`console:getFunctionsMeta`, `console:getAllMeta`, …) are never scaffolded, so tools that introspect a running app (e.g. the Fabric sandbox builder) hit 404s and show no functions. The fix hint suggests `"console": "no-auth"` (or `"auth"`).
