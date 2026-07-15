---
'@pikku/cli': patch
---

`pikku fabric validate` now flags a `packages/mantine-theme/` package that has no console-readable theme spec. It mirrors the Fabric console's `getSandboxThemes` file logic: a package with only a hand-written `createTheme()` (no `themes/<id>.json` + `active.json`) renders fine but makes the console Design tab report "no theme set" and leaves it uneditable. New info findings: `theme-no-spec` (no `themes/<id>.json`), `theme-no-active` (spec present but `active.json` missing/id-less), and `theme-active-mismatch` (`active.json.id` points at a non-existent spec).
