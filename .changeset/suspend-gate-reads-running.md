---
'@pikku/core': patch
---

A suspended workflow's pause step now reads as `running` while the run waits, and only becomes `succeeded` when the run resumes past it — previously it was marked succeeded the moment the run paused.
