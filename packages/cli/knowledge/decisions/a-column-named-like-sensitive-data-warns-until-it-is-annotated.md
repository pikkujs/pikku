---
type: decision
title: A column named like sensitive data warns until it is annotated
description: db codegen warns PKU486 or PKU487 on pii- or credential-looking column names with no security annotation; the default stays private, only an annotation silences it
tags: cli, db, classification, security
---

# A column named like sensitive data warns until it is annotated

An unannotated column is already `private` (`ann?.classification ?? 'private'`
in `db-codegen.ts`), so nothing was ever treated as public by omission. That
default is unchanged. What was missing was a nudge: a `customer_email` or an
`api_key` sat at `private` without anyone having said it was pii or a secret,
so it was never anonymised, wrapped or hashed.

The nudge is a warning in the per-column loop of `db-codegen.ts`, next to
PKU483. PKU486 is a pii-looking name, PKU487 a credential-looking one. They are
separate codes so a project can ratchet each. Both go through
`logger.diagnostic`, so `--fail-on-warn` gates them.

Matching is on whole tokens of the snake/camel-split name (`sensitive-names.ts`),
never substrings, which is what keeps `zip` and `description` away from `ip`.
Booleans, dates and numbers are skipped, as are names that are about a
credential rather than one (`_at`, `_count`, `_id`, `_type`, `_ref`,
`_verified`, `has_`/`is_`). A bare `name` is only pii on a person table, and the
list is kept short on purpose.

Only an annotation silences it. An explicit `private` is a deliberate answer and
counts; an explicit `public` on a pii-looking name still warns. A config switch
was rejected: it would silence a whole project where an annotation records a
decision about one column.

Tables Better Auth, the runtime or an addon create are skipped, found through
`readMigrationProvenance`. The app does not own those tables and cannot
annotate them, and no built-in annotation set for them exists yet.

**What this rules out:** treating an unannotated column as public, and a global
off switch for the warning.
