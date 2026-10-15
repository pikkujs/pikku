---
type: overview
title: Questions
description: Things asked of the Kysely stores and not yet answered
---

# Questions

Something asked and not yet answered. The code makes a choice nobody has stated, so the
doubt is recorded with the current behaviour, not a guessed rationale.

<!-- pikku:knowledge-index -->
- [Do the Kysely stores check who calls them?](do-the-kysely-stores-check-who-calls-them.md) — The virtual-user run, schedule and audit stores take no identity or scope argument, so their authorisation rests on callers, and the run store's comment says reads are scope-gated somewhere else
- [Does a trigger-source row hold only provider identifiers?](does-a-trigger-source-row-hold-only-provider-identifiers.md) — The trigger-source schema says state holds provider identifiers and that signing secrets go to the credential service, but the store writes whatever state the caller passes as JSON
- [Should pikku user sessions expire on their own?](should-pikku-user-sessions-expire-on-their-own.md) — The Kysely session store writes a session with no expiry, reads it back at any age, and its table has no expiry column
- [Should secret and credential reads be audited by default?](should-secret-and-credential-reads-be-audited-by-default.md) — The Kysely secret and credential stores leave auditing off, leave reads unaudited unless asked, and the secret store never records bulk reads; the generic query audit goes the other way
<!-- /pikku:knowledge-index -->
