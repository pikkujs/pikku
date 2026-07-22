---
'@pikku/inspector': patch
---

Distinguish an unresolvable schema type from an unsupported schema library.

Both failures shared one message, so a plain `z.object({...})` whose type TypeScript
could not resolve — a file outside tsconfig `include`, or a generated file such as
`.pikku/db/zod.gen.ts` that had not been written yet — was reported as
"Ensure your schema is imported from a supported validation library". The schema is
dropped either way (`inputSchemaName: null`, no generated schema file), so the message
is the only signal that a function has silently lost its input contract, and that
advice is unactionable when the schema already is zod.
