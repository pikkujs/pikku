---
type: decision
title: An entry-owned key cannot be replaced by a provider
description: serviceSupport reports the keys an entry opens itself (the standalone kysely, and dev's when the project has a db section); a provider providing one is PKU397, so a database addon has no deploy:standalone variant
tags: [deploy, provider, kysely, standalone]
---

# An entry-owned key cannot be replaced by a provider

A baseline key normally meets needs and may be replaced by exactly one provider.
Some baseline keys are built first and the rest of the entry is built on them: the
standalone entry opens its own `kysely` and builds the workflow, scheduler and
queue services from it, and `pikku dev` does the same when the project has a `db`
section. `ServiceSupport.entryOwned` names them, and a provider that provides one
fails with PKU397 so the entry and the provider never own two copies of the
database.

A database addon (`@pikku/addon-kysely-postgres` and the others) therefore has
`dev` and `deploy:cloudflare-*` variants and no `deploy:standalone` variant, and a
project that wires one does not declare `db` for `pikku dev`. On standalone the
provider simply is not run: the key is already held.

**What this rules out:** letting a database addon own the standalone database,
which would need the entry to build everything after the runner from
`services.kysely`.
