---
'@pikku/cli': patch
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/inspector-go': patch
'@pikku/addon-console': patch
'@pikku/deploy': patch
'@pikku/skills': patch
---

Breaking: `db/annotations.ts` is removed. Column annotations (`security`, `form`, `keyId`, `classification`, `kind`, `tsType`, `format`, `description`) are declared only on the columns in `db/tables.ts`; a table the migrations create is declared `declareOnly: true`. `pikku db migrate`, `generate`, `check` and `pikku validate` refuse a project that still has `db/annotations.ts`, pointing at docs/MIGRATION.md. `pikku db annotate`, `.pikku/db/classification-map.gen.d.ts` and `DbClassificationMap` are gone. `db/annotations.gen.json` is still written, now from the declaration alone, and removed when there is no `db/tables.ts`. The PKU910 hint, error messages, docs and skills name the column in `db/tables.ts`.
