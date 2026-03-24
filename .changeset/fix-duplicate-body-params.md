---
"@pikku/openapi-parser": patch
---

Fix duplicate property error in generated code when body and path/query/header params share the same name. Skips the body property with a warning.
