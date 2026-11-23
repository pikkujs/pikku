---
'@pikku/cli': patch
---

The missing-dependency check no longer reads a deploy unit's generated `package.json`; it checks the project that owns the unit.
