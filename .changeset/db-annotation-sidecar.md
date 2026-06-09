---
"@pikku/cli": patch
---

**`pikku db migrate` now loads column classification annotations from a `db/annotations.gen.json` sidecar.**

Projects can annotate database columns with visibility (`public` / `private` / `secret`) and classification (`pii`, `hash`, `token`, `encrypted`, `redact`) in a typed `db/annotations.ts` file. Running `yarn db:types` generates `db/annotations.gen.json` which `pikku db migrate` reads to brand columns in the emitted `schema.d.ts`.

Changes:
- `annotation-parser`: `loadAnnotations()` is now synchronous and reads `db/annotations.gen.json` via `readFileSync`/JSON.parse (compiled CLI cannot `import()` `.ts` files). Falls back to SQL comment parsing when the JSON file is absent.
- `db-codegen`: `bareTableName()` strips schema prefixes (e.g. `app.user` → `user`) before looking up annotations, so postgres schema-qualified tables resolve correctly.
- `db-codegen`: `Private<T>` and `Secret<T>` are emitted as transparent aliases (`= T`) so Kysely WHERE clause typing works without modification.
- `annotation-parser`: `parseAnnotations` no longer sets `anonymize: null` when no strategy is present — the field is omitted entirely (it is optional).
