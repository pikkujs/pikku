---
'@pikku/n8n-import': patch
---

Map n8n's executeCommand node to `execution:execute` (@pikku/addon-execution).
It runs the node's `command` on the host, capturing stdout/stderr/exitCode,
instead of emitting a throwing stub. Corpus clean 1080 → 1091.
