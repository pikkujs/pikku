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

Also: applying a schema over a `withSchema(...)`-bound **sqlite** connection now
explains itself. `withSchema` qualifies foreign key targets along with everything
else — which postgres requires and sqlite refuses, since a `REFERENCES` clause
there takes a bare table name — and all the engine says about it is
`near ".": syntax error`. The failure is now reported with the schema that
produced it and what to do instead, with the engine error kept as the `cause`.
