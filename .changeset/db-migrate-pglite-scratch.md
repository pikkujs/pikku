---
'@pikku/cli': patch
---

Use an embedded PGlite instance for the Better Auth drift-detection scratch database in `pikku db migrate`, instead of issuing `CREATE DATABASE` against the target Postgres. Creating a real scratch database required the `CREATEDB` privilege, so `pikku db migrate` failed (error 42501) against managed or locked-down Postgres where the application role correctly lacks it. PGlite is real Postgres, so schema introspection stays accurate while needing no server privileges.
