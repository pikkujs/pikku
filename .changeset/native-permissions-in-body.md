---
'@pikku/inspector-go': patch
---

Refuse `permissionsInBody: true` in the native inspector unless the project sets
`allow: { permissionsInBody: true }`, as `@pikku/inspector` does (PKU576). The
native engine ignored the opt-in, so the flag silenced the exposed-and-ungated
audit in every project.
