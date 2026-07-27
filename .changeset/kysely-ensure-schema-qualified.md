---
'@pikku/kysely': patch
---

fix: `ensurePikkuSchema` now sees tables on a `withSchema(...)`-bound connection

It read the table name out of its own compiled DDL with a regex that matched the
first quoted identifier. On a connection bound to a schema that DDL is
`create table "app"."workflow_runs"`, so it captured `app` — never a real table
name — concluded every table was missing, and issued a bare `create table` that
the database rejected with `relation "workflow_runs" already exists`, on every
boot.

The schema half of the name is now parsed, and the lookup matches on the pair
when the DDL is qualified (falling back to the bare name when it is not, since
an unqualified statement resolves against a `search_path` that is not knowable
from here). Error messages name the schema too.
