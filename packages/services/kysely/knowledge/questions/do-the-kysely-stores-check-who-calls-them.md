---
type: question
title: Do the Kysely stores check who calls them?
description: The virtual-user run, schedule and audit stores take no identity or scope argument, so their authorisation rests on callers, and the run store's comment says reads are scope-gated somewhere else
tags: [authorization, virtual-users, audit, kysely]
---

# Do the Kysely stores check who calls them?

Three Kysely stores take no identity or scope argument, and the files do not check one.

- **Virtual-user run store.** `get(runId)` and `list({ persona, limit, offset })` run
  queries with no caller check (`packages/services/kysely/src/kysely-virtual-user-run-store.ts:125-151`).
  The class comment says the store is privileged because an adversarial run's findings
  are "working exploits carrying live ids", and that "the scaffolded reads are
  scope-gated" (`kysely-virtual-user-run-store.ts:37-39`). The gate is not in this file.
- **Virtual-user schedule store.** `set(schedule)` takes no identity, and an enabled
  flag written through it makes a persona due (`packages/services/kysely/src/kysely-virtual-user-schedule-store.ts:45-48`,
  `:55`, `:131`). `remove(persona)` takes none either (`:161-167`).
- **Audit service.** `query` applies the `userIds`, `types` and `orgId` filters the
  caller passes and runs them (`packages/services/kysely/src/kysely-audit-service.ts:161-182`,
  `:211-236`). Nothing in those lines checks who is asking.

Current behaviour: authorisation for these stores is entirely in the callers.

Open: which layer is meant to check identity and scope for each store, and is the
run-store scope gate the comment describes implemented anywhere in the repository?
