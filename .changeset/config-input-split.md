---
'@pikku/cli': patch
---

`PikkuCLIInput` now holds only the keys a person writes in `pikku.config.json`. Generated-file paths, CLI flags (`tags`, `wires`, `filters`, `inspector`, `security`, `tsc`, `diff`, ...) and loader-derived values (`configDir`, `addonName`, `resolvedScaffoldDir`) moved to the resolved `PikkuCLIConfig`, and `cli.schema.json` is generated from the input type. The loader still accepts and fills every path key, so behaviour is unchanged.
