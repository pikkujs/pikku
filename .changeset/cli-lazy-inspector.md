---
'@pikku/cli': patch
'@pikku/inspector': patch
---

perf(cli): load the TypeScript compiler only for commands that inspect. `@pikku/inspector`, `@pikku/n8n-import`, the `@pikku/code-edit` root and the mocks stub scanner are now imported inside the functions that need them, and eager values come from the new compiler-free `@pikku/inspector/lite` entry. `pikku --help` drops from ~535 ms to ~415 ms under node (~245 ms to ~195 ms for the compiled binary). Drops the unused `@openapi-contrib/json-schema-to-openapi-schema` dependency and moves `ts-json-schema-generator` (used only by the `schema` script) to devDependencies.
