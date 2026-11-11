---
'@pikku/cli': patch
---

The app surface doc skips each backend's copy of the generated leaves (`#pikku/backends/<name>/*`) and the SDK tree, so a project with a backend no longer fails with `MissingSurfaceEditorialError`.
