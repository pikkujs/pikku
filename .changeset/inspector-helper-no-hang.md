---
'@pikku/inspector-go': patch
---

`pikku all` no longer hangs when the schema helper fails to exit. The inspector takes the helper's answer as soon as it is complete and stops the process, and a helper that never answers now fails after two minutes with a clear error. Set `PIKKU_VENDOR_SCHEMA_TIMEOUT_MS` to allow longer.
