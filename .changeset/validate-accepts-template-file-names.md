---
'@pikku/cli': patch
---

`pikku validate` accepts the starter template's own file names: `*.feature.ts` and `*.step.ts` for features and steps, and `virtual-users.ts` (the file the scaffold reads and edits) for the virtual users. A fresh app from the template no longer fails validate with 17 placement errors.
