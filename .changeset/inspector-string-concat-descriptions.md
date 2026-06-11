---
"@pikku/inspector": patch
---

Fix inspector failing to extract descriptions written as string concatenation (`+`). Descriptions like `'line one ' + 'line two'` are now correctly resolved to their full value. The `checker` parameter is also threaded through `getCommonWireMetaData` so all wiring types benefit from static string evaluation.
