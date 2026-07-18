---
'@pikku/n8n-import': patch
---

Map n8n's executeCommand node onto `execution:execute` (`@pikku/addon-execution`), capturing stdout/stderr/exitCode, instead of a throwing stub.
