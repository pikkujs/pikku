---
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/code-edit': patch
'@pikku/skills': patch
---

A `pikkuPermission` that never uses its `data` argument is now reported as PKU586, because it should have been a `pikkuAuth`. It is a warning, and a critical under `pikku all --strict-meta` and `pikku validate --strict --codegen`, which now runs codegen with `--strict-meta`. The inspector reads these cases, and anything that cannot be determined is left alone. `pikku doc PKU586` explains it. `pikku new permission` now scaffolds a `pikkuAuth`. See docs/MIGRATION.md.
