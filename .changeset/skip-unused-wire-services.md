---
'@pikku/core': patch
'@pikku/inspector': patch
---

A function whose services are all singletons no longer builds wire services, so an addon's credential-bound wire factory does not run for, or fail, a webhook `receive` step that needs no connection. The inspector decides this from the `Services` type and records it as `singletonServicesOnly` on the function's runtime meta; the runner only reads the flag.
