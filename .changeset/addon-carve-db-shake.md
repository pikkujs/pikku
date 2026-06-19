---
'@pikku/cli': minor
---

Wire the DB-ownership core into `pikku new addon --carve`: when the bundled functions use `kysely`, the command now scopes the addon to the tables it actually owns and ships only those.

- Runs the compile-oracle (`carveDbAddon`) at carve time over the carved function sources — typing kysely as `Kysely<Pick<DB, owned>>` and widening to a fixpoint — then emits the owned-table SQL (`db/<engine>/0001-<addon>.sql`), the scoped `AddonDB = Pick<DB, …>` type, and a `pikkuAddonServices` factory that declares `kysely` as a required parent service.
- The addon's `application-types` types `kysely: Kysely<AddonDB>`, so the bundled functions only ever see the addon's owned tables — the type-level half of the DB shake. The raw-SQL gate fails the carve rather than shipping an addon silently missing tables.
- **Service shake (multi-service):** beyond kysely, the carve now also shakes the user-defined services the bundled functions destructure. Each such service is declared on the addon's own `SingletonServices` and its declaring type file is copied in, so the generated `pikkuAddonServices` factory type-checks against the same service types as the source. The service type is resolved through the source `application-types` imports — not by name — so a type sharing a name with one in a dependency (e.g. core's own `EmailService`) is never picked up by mistake. A service is supported when every referenced type resolves to a self-contained local file or a global/library type; services typed via an external package or a transitive local file are reported as unsupported rather than carved with a dangling reference.
- The `addon-carve` verifier proves the shake end-to-end: a 3-table source DB where the carved function touches 2 (`post`, `user`) and an un-carved function uses the 3rd (`auditLog`) — the addon owns exactly `post`+`user`, asserted against both the scoped type and the generated SQL. A second `notifyaddon` carves a function using `kysely` + two user services (`email`, `clock`): the addon requires exactly those three parent services and declares + copies each user service's type, asserted and consumer-type-checked.

The kysely DB type is currently assumed to be named `DB` and the engine `sqlite` (TODOs to derive both). Services typed via external packages are not yet carved (re-imported from the package) — they warn instead.
