---
type: decision
title: A bigint column reads as a number and throws above the safe range, and a declareOnly column's type comes from the database
description: integer is the default number type, type bigint (or kind bigint) is the opt-in 64-bit variant read as a JS number with a runtime range check, an undeclared int8 or numeric reads as a string on postgres, and a declareOnly column may omit its type
tags: cli, db, types, coercion
---

# A bigint column reads as a number and throws above the safe range, and a declareOnly column's type comes from the database

The vocabulary follows Better Auth's convention (a number type plus a `bigint`
flag) rather than adding a second family of names. `integer` stays the default
number type, 32-bit storage read as `number`. `bigint` stays in `ColumnType` as
the opt-in 64-bit variant and is **still read as a `number`**: the column gets the
coercion kind `bigint`, and the plugin in `@pikku/kysely` throws a `RangeError`
naming the column when a value is outside `Number.MIN_SAFE_INTEGER` to
`Number.MAX_SAFE_INTEGER`, instead of rounding it. The kind is implied by
`type: 'bigint'`; on a `declareOnly` table that has no `type` it is written
`kind: 'bigint'`.

An undeclared 64-bit integer or decimal is not guessed to be a number. On
Postgres the driver hands int8 and numeric back as strings, so the generated type
is `string`. SQLite stores both as plain numbers and MySQL returns a `BIGINT` as a
number, so there an undeclared `bigint` reads as `number` and a decimal reads as
`string` on MySQL and `number` on SQLite. bytea and blob read as `Uint8Array`.

`declareOnly` makes `type` optional, because the migration already says what the
column is. A declared `type`, `tsType` or `kind` that the real column cannot hold
is an error. `tsType` is only judged when it is a primitive (`number`, `string`,
`boolean`, `Uint8Array`); any other `tsType` is a refinement (a union, a JSON
shape) that the column family cannot contradict.

`typeFamilyOf` in `column-family.ts` is the one place a database type becomes a
family. It matches whole words: the earlier substring tests read `interval` and
`point` as integers (they contain `int`) and let `serial` fall through to string.
SQLite stores every integer in 64 bits, so there `integer` and `bigint` both
accept either family; on Postgres `integer` over an int8 is an error.

## Rejected

- A new `number64` or `int64` type name. A second vocabulary for the same thing
  that Better Auth already spells as a flag on a number.
- Reading an undeclared int8 as `number`. It is lossy above 2^53 without anyone
  having asked for the check, which is the failure the range check exists for.
- Adding `decimal` and `bytea` to `ColumnType`. Generated tables do not need them
  yet; they only occur in tables something else creates, where the type is read
  from the database.
