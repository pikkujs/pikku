---
"@pikku/core": patch
---

Strip undefined values from workflow step data before dispatching to the queue service, preventing postgres UNDEFINED_VALUE errors.
