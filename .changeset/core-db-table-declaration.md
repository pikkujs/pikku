---
'@pikku/core': patch
'@pikku/kysely': patch
---

New `@pikku/core/db` entry point with the plain table declaration vocabulary (`defineTables`, `TablesDeclaration`, `ColumnDeclaration`, `OnDelete`, and the column annotation types, which `@pikku/kysely` now re-exports from there). `@pikku/kysely` gains `compileTables(decl)`, which compiles a declaration into schema statements for sqlite, postgres and MySQL, and `tableRequirements(decl)`. `SchemaContext.references` and `foreignKeys` take an `onDelete` (`cascade`, `setNull`, `restrict`, `noAction`), defaulting to `restrict`; the framework's own schemas pass `cascade` explicitly, so the SQL they compile is unchanged. Nothing reads the new declaration yet: `db/tables.ts` still takes `defineTables` from `@pikku/kysely`.
