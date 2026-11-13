---
'@pikku/kysely': patch
---

Follow-up to the table declaration compiler. Physical names in `tableRequirements` and generated constraint names now use `CamelCasePlugin`'s own conversion (`apiURL` is `api_url`). `compileTables` refuses `string(0)`, and `onDelete: 'setNull'` on a column in a composite primary key. `applyPikkuSchemas` builds every statement before running any, so a refused statement (a partial index on MySQL) leaves nothing applied. `ForeignKeyTarget`'s `onDelete` is optional, defaulting to `restrict`.
