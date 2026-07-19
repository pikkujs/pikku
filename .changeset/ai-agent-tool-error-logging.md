---
'@pikku/core': patch
---

AI agent tool `execute()` failures are now logged via `logger.error` unconditionally (then rethrown), instead of only surfacing when a tool-call middleware hook is registered.
