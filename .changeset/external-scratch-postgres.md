---
'@pikku/cli': patch
---

`pikku db` commands can compute Postgres schemas in throwaway databases on a server you name with `PIKKU_SCRATCH_DATABASE_URL`, which is much faster than the embedded PGlite database. The role needs `CREATEDB`, and any extension your migrations use has to be installed on that server. Without the variable nothing changes, and `DATABASE_URL` is never used for this.
