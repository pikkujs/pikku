---
'@pikku/core': patch
---

A function whose services are all singletons no longer builds wire services, so an addon's credential-bound wire factory does not run for, or fail, a webhook `receive` step that needs no connection.
