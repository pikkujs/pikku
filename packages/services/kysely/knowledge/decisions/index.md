---
type: overview
title: Decisions
description: How encrypted columns are wrapped, and which key wraps them
---

# Decisions

<!-- pikku:knowledge-index -->

- [A lease is taken by one guarded UPDATE](a-lease-is-taken-by-one-guarded-update.md) — Acquire inserts the key's row already lapsed, takes it with a guarded UPDATE, and reads the row back, because that is the one shape that behaves the same on SQLite, Postgres and MySQL
- [Classification-driven encryption happens in a Kysely plugin](classification-driven-encryption-happens-in-a-plugin.md) — The existing column classification manifest drives a transparent query plugin, rather than encrypting the whole database file or asking call sites to encrypt
- [KEKs are scoped by purpose as well as version](keks-are-scoped-by-purpose-as-well-as-version.md) — Rows carry a keyId, and the plugin resolves KEKs through a seam rather than holding one; v1 ships a single key, but scoping never becomes a migration
- [Leases are judged by the database's clock](leases-are-judged-by-the-database-clock.md) — A lease and a step lease are written and compared in SQL against the server's own clock, stored as epoch milliseconds, so no worker's clock decides who holds anything
- [The plugin is given a resolver, never a key](the-plugin-is-given-a-resolver-never-a-key.md) — Assembly order for classified columns — a plain Kysely handle, then a plugin that asks a `KEKResolver` per operation rather than being handed a key it holds for the life of the process
- [Workflows own the lease table too](workflows-own-the-lease-table-too.md) — `leaseSchema` is owned by `workflowService` as well as `leaseService`, because the engine takes the run lease without any function ever naming leaseService

<!-- /pikku:knowledge-index -->
