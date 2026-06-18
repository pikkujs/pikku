---
'@pikku/cli': patch
---

Fix Better Auth drift check incorrectly reporting tables as missing when they live in a non-public Postgres schema (e.g. `app.user` not matching desired `user`).
