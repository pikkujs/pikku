---
'@pikku/cli': patch
---

fix: postgres introspection no longer re-derives primary keys per column

`getAllColumns` built its `pk_cols` CTE without a fence. Referenced once,
Postgres 12+ inlines such a CTE, so the constraint views it joins were
re-derived for every candidate row — quadratic in the number of tables, and
paid by every `pikku db migrate` and every schema regeneration. Fenced with
`AS MATERIALIZED`, it is computed once.
