---
'@pikku/cli': patch
'@pikku/deploy-standalone': patch
---

`pikku dev` keeps workflow runs in the project's database, as `pikku serve` does, so a run survives a restart of the dev server. The generated local services and the standalone entry fence runs with leases in the same database (`KyselyLeaseService`, `PgKyselyLeaseService`, `MySQLKyselyLeaseService`), so a second process on it cannot run a run or step the first holds; without the `pikku_lease` table they warn and keep in-memory leases. A tool a harness gate runs is the leader of its own process group, stopped as a group on abort, timeout and exit, and locked by pid, group and start time in the gate's `scratch/tools`; a gate run first stops a tool that an earlier run left running when its server died. `PiLock` is renamed `ProcessLock`.
