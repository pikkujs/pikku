---
"@pikku/cli": patch
---

fix(db): emit `db/schema.gen.ts` instead of `db/schema.gen.d.ts`

The 0.12.58 rename of `db/schema.d.ts` → `db/schema.gen.d.ts` was half-finished:
the validate rules and templates were updated to import `#pikku/db/schema.gen.js`,
but the generated file kept the `.d.ts` extension. With the standard subpath
import map (`"#pikku/*.gen.js": "./.pikku/*.gen.ts"`), `#pikku/db/schema.gen.js`
resolves to `schema.gen.ts` — which never existed, so the import failed with
`Cannot find module '#pikku/db/schema.gen.js'` and every project's `services.ts`
(`import type { DB } from '#pikku/db/schema.gen.js'`) broke under Node16
resolution.

The schema body is type-only (an `import type` from kysely plus interfaces and
type aliases), so it is valid as a regular `.ts` module — genuinely matching the
`coercion.gen.ts` / `classification.gen.ts` convention the rename cited. The
generator now writes `schema.gen.ts`; the zod codegen reads it from the same
descriptor, so both stay in lockstep.
