---
'@pikku/n8n-import': patch
'@pikku/inspector': patch
---

Fix two corpus type-check failures: n8n `graph:sort`/`graph:summarize` enum rows now emit `as const`, and the inspector's `sanitizeTypeName` prefixes an underscore when a name starts with a digit.
