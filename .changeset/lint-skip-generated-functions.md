---
'@pikku/inspector': patch
'@pikku/cli': patch
---

fix(lint): don't fail the build on framework-synthesized functions

The `servicesNotDestructured`/`wiresNotDestructured` defaults (`error`) were
tripping on functions the user can't edit: generated `.gen.ts` wrappers (the
opaque `authHandler`, the cli channel raw dispatcher) and synthetic route→addon
bridges (`http:<method>:<route>`, no source file). `computeDiagnostics` now skips
any function without a real, non-generated source file, so the lint only nudges
hand-written user code. Also destructures the CLI's own `all` command.
