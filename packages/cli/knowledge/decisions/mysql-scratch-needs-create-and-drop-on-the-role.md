---
type: decision
title: MySQL scratch migrations need the configured role to hold CREATE and DROP on databases
description: withScratchMysqlDatabase creates and drops a throwaway database on the configured server, so the role must hold CREATE and DROP on databases
tags: cli, db, mysql, migrations
---

# MySQL scratch migrations need the configured role to hold CREATE and DROP on databases

`withScratchMysqlDatabase` in `packages/cli/src/functions/db/mysql/mysql-client.ts` runs a callback against a database
that exists only for the call. The doc comment says MySQL has no embedded engine, so the throwaway is a database on the
configured server, created and dropped around the call. The configured role therefore needs `CREATE` and `DROP` on
databases (`mysql-client.ts:63-70`).

It creates `pikku_scratch_<random>` with `CREATE DATABASE` (`mysql-client.ts:76-80`). When that fails, the error names
`CREATE` and `DROP` and suggests pointing `mysqlUrl` at a server the user administers (`mysql-client.ts:81-87`).

**What this rules out:** running `db migrate --scratch`, `db generate` or `db check` on MySQL with a role limited to one
existing database.
