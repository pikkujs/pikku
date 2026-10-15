---
type: overview
title: Decisions
description: How encrypted columns are wrapped, and which key wraps them
---

# Decisions

<!-- pikku:knowledge-index -->
- [A console role cannot take a system role's name](a-console-role-cannot-take-a-system-roles-name.md) — createRole refuses any name the store holds as a system role, and asks the pikkuRoles table rather than the declared list, so one name never answers to two roles
- [A credential with no user is one row per name](a-credential-with-no-user-is-one-row-per-name.md) — The database enforces one app-wide credential per name by indexing COALESCE(user_id, ''), and the service maps a missing user to IS NULL
- [A lease is taken by one guarded UPDATE](a-lease-is-taken-by-one-guarded-update.md) — Acquire inserts the key's row already lapsed, takes it with a guarded UPDATE, and reads the row back, because that is the one shape that behaves the same on SQLite, Postgres and MySQL
- [A virtual user's schedule starts disabled](a-virtual-users-schedule-starts-disabled.md) — A virtual-user schedule is written with enabled off unless the caller says otherwise, and only enabled rows come due, so unattended runs need an explicit enable
- [Classification-driven encryption happens in a Kysely plugin](classification-driven-encryption-happens-in-a-plugin.md) — The existing column classification manifest drives a transparent query plugin, rather than encrypting the whole database file or asking call sites to encrypt
- [Grants reference declared scopes and users by foreign key](grants-reference-declared-scopes-and-users-by-foreign-key.md) — The scope tables tie role and user grants to pikkuScopes and to Better Auth's user table with foreign keys, so the database refuses a grant of an undeclared scope
- [KEKs are scoped by purpose as well as version](keks-are-scoped-by-purpose-as-well-as-version.md) — Rows carry a keyId, and the plugin resolves KEKs through a seam rather than holding one; v1 ships a single key, but scoping never becomes a migration
- [Leases are judged by the database's clock](leases-are-judged-by-the-database-clock.md) — A lease and a step lease are written and compared in SQL against the server's own clock, stored as epoch milliseconds, so no worker's clock decides who holds anything
- [The plugin is given a resolver, never a key](the-plugin-is-given-a-resolver-never-a-key.md) — Assembly order for classified columns — a plain Kysely handle, then a plugin that asks a `KEKResolver` per operation rather than being handed a key it holds for the life of the process
- [The secrets audit table is declared even when auditing is off](the-secrets-audit-table-is-declared-even-when-auditing-is-off.md) — secretsAudit is created by the secret migration unconditionally, because a migration cannot depend on runtime config and an unused table costs nothing
- [Workflows own the lease table too](workflows-own-the-lease-table-too.md) — `leaseSchema` is owned by `workflowService` as well as `leaseService`, because the engine takes the run lease without any function ever naming leaseService
<!-- /pikku:knowledge-index -->
