---
'@pikku/cli': patch
---

Group deployment units by service set by default

`deploy.grouping.strategy` now defaults to `'services'` instead of `'function'`:
a unit holds every function that builds the same set of singleton services,
rather than one unit per function. On `templates/functions` that is 10 units
where it used to be 44.

Set `"grouping": { "strategy": "function" }` in `pikku.config.json` to keep one
unit per function.

This renames units. The manifest rewrites `consumerUnit`, `unitName` and
`dependsOn` to match, but anything holding a unit name outside the manifest does
not follow, and units that fall out of the manifest are not deleted — `deploy()`
is upsert-only (#543), so the previous generation of workers stays live until
something removes it.
