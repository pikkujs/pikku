---
"@pikku/openapi-parser": patch
---

Use JSON.stringify for safe interpolation of OpenAPI spec values in generated code to prevent code injection via malicious specs.
