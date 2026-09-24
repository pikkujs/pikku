---
'@pikku/inspector': patch
---

An inline `input`/`output` schema (PKU489) is now an `error` diagnostic instead of a critical one, so `pikku dev` keeps running. The function is validated against its TypeScript type until the schema is extracted to an exported variable; `--fail-on-error` still blocks it.
