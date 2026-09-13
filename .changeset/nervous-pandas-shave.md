---
'@pikku/inspector': patch
'@pikku/cli': patch
---

Print the TypeScript text for a Zod schema directly, dropping `zod-to-ts`.

`processZodSchema` built a TypeScript AST only to print it straight back to a
string. `zodToTypeText` walks Zod's own definitions instead, which removes
`zod-to-ts`, `ts.createPrinter`, `ts.EmitHint` and `ts.createSourceFile` from
the Zod path — it no longer touches the compiler API at all. `@pikku/cli`
declared `zod-to-ts` without importing it; that is dropped too.

A defaulted field is now optional in the generated type. `processZodSchema`
already strips defaulted fields out of the JSON Schema's `required`, so the two
halves of the same contract disagreed: the validator accepted a payload that
omitted the field, while the type said a caller had to pass it.
