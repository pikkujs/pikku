---
"@pikku/cli": patch
"@pikku/openapi-to-zod-schema": patch
---

Fix OpenAPI codegen bugs: use operation description instead of response description, sanitize dots in type names, quote hyphenated property keys, make function input optional in types, and use pikkuServices() in test template.
