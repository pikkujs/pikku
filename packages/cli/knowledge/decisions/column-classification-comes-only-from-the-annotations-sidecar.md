---
type: decision
title: Column classification is read only from the annotations sidecar, which only the table declaration writes
description: loadAnnotations reads db/annotations.gen.json as the single source of column classification, with no SQL comment fallback; pikku db migrate writes it from the column annotations in db/tables.ts alone
tags: cli, db, annotations, privacy
---

# Column classification is read only from the annotations sidecar, which only the table declaration writes

`loadAnnotations` in `packages/cli/src/functions/db/annotation-parser.ts` reads
`db/annotations.gen.json` (`annotation-parser.ts:103-104`). The comment calls it the single
source of column classification and says there is no SQL-comment fallback (`annotation-parser.ts:94-95`).

`pikku db migrate` writes the sidecar from the column annotations in `db/tables.ts` and nothing
else (`writeAnnotationsSidecar` in `local-db.ts`). It is flat, keyed by physical table then
column, which is how codegen looks columns up. With no declaration the sidecar is removed, so a
stale one cannot keep classifying columns.

**What this rules out:** a classification fallback that reads SQL comments, a second authored
source beside `db/tables.ts`, and lookups that use schema-qualified keys.
