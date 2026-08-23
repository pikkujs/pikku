---
'@pikku/core': patch
---

`addFunction` accepts a config carrying its schemas. It typed the parameter with
two type arguments where the schema-carrying overloads of
`CorePikkuFunctionConfig` need five, so every generated scenario registration
failed to typecheck — invisible until a real project was compiled in CI.
