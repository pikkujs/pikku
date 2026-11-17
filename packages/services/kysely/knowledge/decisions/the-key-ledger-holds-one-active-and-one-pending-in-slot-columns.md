---
type: decision
title: The key ledger holds one active and one pending in slot columns
description: pikku_key keeps one-active and one-pending per name and scope as unique indexes over two nullable slot columns, because MySQL has no partial indexes and the table DSL has no CHECK, so the store keeps status, slots and retired_at together
tags: [keys, kysely, mysql, postgres]
---

# The key ledger holds one active and one pending in slot columns

`KyselyKeyStore` must allow at most one `active` and one `pending` key per
`(name, scope_key)`. The obvious form is two partial unique indexes
(`where status = 'active'`), but `compileTables` refuses a partial index on
MySQL. So the rule is spelled once, in a form every dialect has: `active_slot`
and `pending_slot` are 1 while the row holds that status and null otherwise, and
plain unique indexes over `(name, scope_key, <slot>)` do the rest (NULLs are
distinct everywhere).

The table DSL has no CHECK vocabulary either, so the tie between `status`, the
slots and `retired_at` is kept by the store: every write of a status goes
through one helper that writes all three together. A host that wants real CHECKs
adds them in its own migration.

Postgres checks a non-deferrable unique index per row, so a transition that
frees a slot and takes it in the same step must free it first: `promote`
demotes the old active row before it activates the pending one, and
`importRecords` writes rows that leave `active` or `pending` before rows that
enter them.

`metadata` is `jsonb` on Postgres and text elsewhere, so compare-and-set is on a
`rev` integer the store increments, never on the JSON. It is read back as text
and parsed, so no driver or `CamelCasePlugin` re-keys the document. On Postgres
it is written through `cast(cast(? as text) as jsonb)`, because postgres.js
would otherwise store the JSON text as a quoted string inside the document.

**What this rules out:** partial indexes for the one-active rule, deferrable
constraints, and comparing `metadata` to detect a concurrent change.
