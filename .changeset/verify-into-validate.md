---
'@pikku/cli': patch
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/react': patch
'@pikku/skills': patch
'@pikku/addon-console': patch
---

`pikku verify` is merged into `pikku validate`, which now runs the type-check and correctness checks, skips codegen unless `--codegen` is passed, and exits non-zero on any error. The `pikku verify` command is gone; `runVerify`, `VerifyService` and the recorded results stay. See MIGRATION.md.
