---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikkuPermission` now refuses a call with no session without running the check, like `pikkuAuth`, so `session` is always defined inside a check. `skipWithoutSession: true` on either makes the check pass with no session instead, and the function decides what that caller may see. A check without it on a sessionless function, directly or as a global permission, is now the error PKU587. `pikku doc PKU587` explains it. See docs/MIGRATION.md.
