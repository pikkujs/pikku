---
'@pikku/cli': patch
---

`db generate` and `db check` now agree with PostgreSQL about which schema a runtime table lives in, when `db.schema` names one.

Coverage matching let a copy of a runtime table in another schema satisfy a source whose tables belong in the configured one, so `db generate` could call the source up to date having created nothing there. The generated `ALTER TABLE` delta inserted the schema raw, and PostgreSQL folds an unquoted identifier, so a mixed-case `db.schema` altered a table the runtime never reads. `db check` reported the configured schema's tables as living in `public`.
