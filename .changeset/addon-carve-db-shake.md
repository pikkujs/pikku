---
'@pikku/cli': minor
---

Wire the DB-ownership core into `pikku new addon --carve`: when the bundled functions use `kysely`, the command now scopes the addon to the tables it actually owns and ships only those.

- Runs the compile-oracle (`carveDbAddon`) at carve time over the carved function sources — typing kysely as `Kysely<Pick<DB, owned>>` and widening to a fixpoint — then emits the owned-table SQL (`db/<engine>/0001-<addon>.sql`), the scoped `AddonDB = Pick<DB, …>` type, and a `pikkuAddonServices` factory that declares `kysely` as a required parent service.
- The addon's `application-types` types `kysely: Kysely<AddonDB>`, so the bundled functions only ever see the addon's owned tables — the type-level half of the DB shake. The raw-SQL gate fails the carve rather than shipping an addon silently missing tables.
- The `addon-carve` verifier proves the shake end-to-end: a 3-table source DB where the carved function touches 2 (`post`, `user`) and an un-carved function uses the 3rd (`auditLog`) — the addon owns exactly `post`+`user`, asserted against both the scoped type and the generated SQL.

The kysely DB type is currently assumed to be named `DB` and the engine `sqlite` (TODOs to derive both).
