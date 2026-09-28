---
'@pikku/cli': patch
---

`pikku validate` reports a raw `sql` template that double-quotes a non-snake_case
identifier (`raw-sql-camel-case-identifier`). `CamelCasePlugin` never rewrites the
text of a raw template, so `"createdAt"` reaches the database verbatim and fails
with `no such column`.
