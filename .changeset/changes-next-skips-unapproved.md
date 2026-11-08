---
'@pikku/addon-changes-cli': patch
---

`pikku changes next` and `wait` no longer offer a change that cloud filed itself and no person has approved. The hosted API refuses to claim it, so a build loop that routed it to an agent could never finish it and kept re-prompting; it now falls through to the next kind of work.
