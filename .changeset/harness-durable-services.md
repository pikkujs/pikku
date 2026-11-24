---
'@pikku/cli': patch
'@pikku/deploy-standalone': patch
---

`pikku dev` keeps workflow runs in the project's database, as `pikku serve` does, so a run survives a restart of the dev server. The generated local services and the standalone entry fence runs with leases in the same database (`KyselyLeaseService`, `PgKyselyLeaseService`, `MySQLKyselyLeaseService`), so a second process on it cannot run a run or step the first holds; without the `pikku_lease` table they warn and keep in-memory leases. The `pikku check` and page compare that `pikku changes done` runs lead their own process group, stopped as a group on timeout and when the CLI exits or is stopped by SIGTERM or SIGINT.
