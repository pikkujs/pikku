---
"@pikku/core": patch
"@pikku/cli": patch
"@pikku/inspector": patch
---

fix(db): make classified columns usable in Kysely queries and emit real zod

Two fixes so data-classified DB columns (`@private`/`@pii`/`@secret`, default
`private`) are usable end-to-end instead of poisoning ordinary app code:

1. **Brand marker is now optional** (`{ readonly __classification__?: ... }`)
   in both `@pikku/core` and the `pikku db migrate` schema header. A required
   marker made a plain value (e.g. `string`) unassignable to a branded column
   (`Private<string>`), breaking every Kysely `where`/insert/`.set()` operand —
   any project with classified columns failed to type-check. Optional keeps the
   brand structurally present (so the inspector's PKU910 output check still
   detects it) while letting plain values flow IN. The inspector's level read is
   now union-aware (`'pii' | undefined`) so pii/secret no longer silently
   downgrade to private.

2. **Zod codegen resolves classified `ColumnType<>`** to proper scalars instead
   of `z.unknown()`. `pikku db migrate` emits `<Table>Z`/`InsertZ`/`PatchZ` from
   the Select slot, unwrapping the brand and honoring insert-optionality from the
   Insert slot's `| undefined`. Public `Generated<T>`/bare/nested shapes are
   unchanged.
