---
'@pikku/cli': patch
---

The Fabric sign-in is stored in `~/.pikkustudio/fabric/auth.json` so the CLI and Pikku Studio share one session. `~/.fabric/auth.json` is still read when the new file does not exist.
