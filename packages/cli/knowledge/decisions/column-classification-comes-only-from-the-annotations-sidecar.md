---
type: decision
title: Column classification is read only from the annotations sidecar and flattened before lookup
description: loadAnnotations reads db/annotations.gen.json as the single source of column classification, with no SQL comment fallback, and flattens a schema-qualified map to bare table names
tags: cli, db, annotations, privacy
---

# Column classification is read only from the annotations sidecar and flattened before lookup

`loadAnnotations` in `packages/cli/src/functions/db/annotation-parser.ts` reads
`db/annotations.gen.json`, which is compiled from the authored `db/annotations.ts`
(`annotation-parser.ts:102-106`, `annotation-parser.ts:121-123`). The comment calls it the single
source of column classification and says there is no SQL-comment fallback (`annotation-parser.ts:105-106`).

A map nested under a schema name is flattened back to bare table names, because codegen looks
columns up by bare name (`annotation-parser.ts:114-116`). The comment says a schema-qualified map
read as flat yields an annotation for every column of every table, which can classify a secret
column as private (`annotation-parser.ts:117-119`).

**What this rules out:** a classification fallback that reads SQL comments, and lookups that use
schema-qualified keys.
