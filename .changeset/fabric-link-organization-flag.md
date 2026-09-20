---
'@pikku/cli': patch
---

`pikku fabric link` and `pikku fabric init` take `--organization`, naming the organization to import into by slug, display name or id. Without it the import still lands in whichever organization the session is scoped to, which silently put a repo in the wrong place for anyone who belongs to more than one.
