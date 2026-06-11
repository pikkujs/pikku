---
"@pikku/core": minor
"@pikku/inspector": patch
---

Add inline option to pikkuFunc/pikkuSessionlessFunc for workflow step dispatch

By default, workflow steps now run inline (no queue hop). Set inline: false on a function to force dispatch through the queue for that step.
