---
"@pikku/schema-ajv": patch
---

Disable coerceTypes in AJV to prevent type confusion attacks where string values are silently converted to booleans or numbers during validation.
