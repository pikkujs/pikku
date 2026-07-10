---
'@pikku/cli': patch
---

Fix `pikku db` schema codegen flattening Postgres array columns to scalar types. `text[]`/`int[]`/`uuid[]` columns now generate as `string[]`/`number[]`/`string[]` in `schema.gen.ts` instead of `string`/`number`. The introspector now captures the array element type from `udt_name` (previously every array column was recorded as the opaque `ARRAY`), and `mapType` preserves the `[]` suffix rather than matching the element substring and dropping the array-ness.
