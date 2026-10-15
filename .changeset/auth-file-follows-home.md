---
'@pikku/cli': patch
---

Resolve `~/.pikkustudio/auth.json` from HOME on every read and write, so tests that point HOME at a temp folder no longer overwrite the real sign-in.
