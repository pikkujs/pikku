---
type: decision
title: A dev database needs `db` in the pikku config when contributors are opted in
description: pikku all refuses a project that declares a database but has no db in its pikku config once contributors are opted in, because dev would build no kysely for them
tags: [contributors, dev, db]
---

# A dev database needs `db` in the pikku config when contributors are opted in

`ContributorPlatform.db` comes from `createConfig` or the `db/<dialect>`
folders, while `kysely` is a `pikku dev` baseline service exactly when the pikku
config has a `db`. A contributor selected on `platform.db` would read a
`runtime.kysely` that is not there, so `reconcileDevKysely` makes `pikku all`
fail with a message naming both, rather than let the two disagree.

The check runs only when contributors are opted in. A project without them is
unaffected. The remedy is to set `db` in the pikku config or remove the database
declaration.
