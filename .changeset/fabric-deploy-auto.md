---
'@pikku/cli': patch
---

Add `pikku fabric deploy auto [on|off] -b <branch>` to show or set whether a push
deploys a stage without waiting for approval. `deploy list` and `status` now say
when a deploy is waiting because auto-deploy is off.
