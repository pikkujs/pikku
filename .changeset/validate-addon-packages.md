---
'@pikku/cli': patch
---

`pikku validate` no longer double-reports a workspace addon or misreads a shipped addon file. The core-import and barrel checks stop walking into a nested directory that has its own `pikku.config.json`, since that project is validated on its own; inside an addon the core-import fix now names the addon's own leaf (`#pikku/addon/error`, not `#pikku/error`, which does not resolve there); and the shipped-import check ignores imports that only appear in comments, such as the usage example at the top of `classification-map.gen.d.ts`.
