---
'@pikku/cli': patch
---

Scenario suites can roll the local database back between run units, without the project exposing a reset of its own.

Set `scenarios.reset` in `pikku.config.json`:

```json
{
  "scenarios": {
    "reset": { "enabled": true, "keep": ["user", "session", "account"] }
  }
}
```

The runner copies every table once, from the migrated and seeded database the
suite is pointed at, and replaces the rows from that copy before every scenario.
`keep` names the tables it leaves alone: an actor signs in once for the whole
run, so its session tables belong there, or every actor is signed out mid-suite.

A feature's `before` hook runs against the seed, and what it builds is then
captured as a second layer. Each of that feature's scenarios rolls back to the
seed *and* the hook's fixtures, so the isolation is per scenario without the
hook running again or its work being thrown away. The layer is dropped when the
feature ends.

This is a copy-and-replace rather than a truncate-and-reseed because a project's
dev seed is plain `INSERT`s — replaying it over the tables `keep` held back is a
primary key conflict, not a reset. Foreign keys are suspended for the duration
(`PRAGMA foreign_keys` on sqlite, `session_replication_role` on Postgres), so a
kept table may be the parent of a replaced one; Postgres sequences are put back
with the rows, since restoring rows without them leaves the next insert claiming
an id that already exists.

The alternative it replaces is a project shipping its own `testReset` RPC and
gating it on an environment variable. That function is in the deploy bundle on
every stage, exposed and one console click from open, and the flag that arms it
is one wrong project id away from truncating a live database. Nothing here
reaches a bundle: it is the runner talking to a database file or server on this
machine. It is refused outright when the environment is marked `production`,
when `apiUrl` is not on this machine, and when `NODE_ENV=production`.
