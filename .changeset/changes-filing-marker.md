---
'@pikku/cli': patch
---

The filing guard is bound to the session, not only to an env var. `pikku changes next --prompt` writes `.pikku/changes-filing.json` (route and time) in the main checkout, and while it is under two hours old `pikku changes claim`, `done` and `merge` refuse unless `PIKKU_CHANGES_BUILDER=1` is set. Agents that `pikku changes next --exec` launches for building get that env; the intake agent never does. `PIKKU_CHANGES_FILING_ONLY=1` still refuses as before.
