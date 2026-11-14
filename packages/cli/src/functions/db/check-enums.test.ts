import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkFingerprint,
  mysqlCheckColumn,
  mysqlCheckEnumValues,
  normaliseCheck,
  parseCheckEnumValues,
  parseCheckEnumsFromDdl,
  parseSqliteChecks,
  postgresCheckExpression,
  stripSqlComments,
} from './check-enums.js'

test('stripSqlComments leaves quoted text that looks like a comment alone', () => {
  assert.equal(
    stripSqlComments(`SELECT '--not a comment'`),
    `SELECT '--not a comment'`
  )
  assert.equal(
    stripSqlComments(`SELECT '/* nor this */'`),
    `SELECT '/* nor this */'`
  )
  assert.equal(stripSqlComments(`SELECT "col--name"`), `SELECT "col--name"`)
})

test('stripSqlComments keeps line breaks so the SQL still reads as lines', () => {
  assert.equal(stripSqlComments('a -- gone\nb'), 'a        \nb')
  assert.equal(stripSqlComments('a /* gone\nhere */ b'), 'a        \n        b')
})

test('stripSqlComments closes an unterminated block comment at end of input', () => {
  assert.equal(stripSqlComments('a /* never closed'), 'a                ')
})

test('stripSqlComments handles a doubled quote inside a value', () => {
  assert.equal(
    stripSqlComments(`v IN ('a''--b') -- gone`),
    `v IN ('a''--b')        `
  )
})

test('parseCheckEnumsFromDdl reads a comment-free CHECK list', () => {
  const enums = parseCheckEnumsFromDdl(
    `CREATE TABLE t (status TEXT CHECK (status IN ('a', 'b')))`
  )
  assert.deepEqual(enums.get('status'), ['a', 'b'])
})

test('parseCheckEnumsFromDdl ignores a bracket inside a comment', () => {
  // Without the strip, `)` in the comment ends the value list two values early.
  const enums = parseCheckEnumsFromDdl(
    `CREATE TABLE t (status TEXT CHECK (status IN (\n  'a', -- (see the report flow)\n  'b'\n)))`
  )
  assert.deepEqual(enums.get('status'), ['a', 'b'])
})

test('parseCheckEnumsFromDdl leaves a non-enumerating CHECK alone', () => {
  const enums = parseCheckEnumsFromDdl(
    `CREATE TABLE t (score INT CHECK (score > 0), s TEXT CHECK (s NOT IN ('x')))`
  )
  assert.equal(enums.get('score'), undefined)
  assert.equal(enums.get('s'), undefined)
})

test('parseCheckEnumValues reads the shape Postgres normalises IN (…) into', () => {
  assert.deepEqual(
    parseCheckEnumValues(
      `CHECK ((status = ANY (ARRAY['draft'::text, 'final'::text])))`
    ),
    ['draft', 'final']
  )
  assert.deepEqual(
    parseCheckEnumValues(
      `CHECK (((band)::text = ANY ((ARRAY['low'::character varying, 'high'::character varying])::text[])))`
    ),
    ['low', 'high']
  )
})

test('parseCheckEnumValues rejects a constraint that is not an enumeration', () => {
  assert.equal(parseCheckEnumValues(`CHECK ((score > 0))`), undefined)
  assert.equal(
    parseCheckEnumValues(`CHECK ((stage <> ALL (ARRAY['retired'::text])))`),
    undefined
  )
  assert.equal(parseCheckEnumValues(`CHECK ((kind = 'only'::text))`), undefined)
})

test('normaliseCheck collapses whitespace and unwraps the whole condition only', () => {
  assert.equal(normaliseCheck('  ((a  >=\n 0))  '), 'a >= 0')
  assert.equal(normaliseCheck('(a >= 0) AND (b <= 1)'), '(a >= 0) AND (b <= 1)')
  assert.equal(normaliseCheck("(a IN ('(', ')'))"), "a IN ('(', ')')")
})

test('postgresCheckExpression strips the CHECK keyword and its parentheses', () => {
  assert.equal(postgresCheckExpression('CHECK ((qty >= 0))'), 'qty >= 0')
  assert.equal(
    postgresCheckExpression(
      "CHECK ((status = ANY (ARRAY['a'::text, 'b'::text])))"
    ),
    "status = ANY (ARRAY['a'::text, 'b'::text])"
  )
  assert.equal(postgresCheckExpression('CHECK ((a > 0)) NOT VALID'), 'a > 0')
})

test('parseSqliteChecks attaches a check to the column it restricts', () => {
  const checks = parseSqliteChecks(
    `CREATE TABLE t (
       id TEXT PRIMARY KEY, -- (CHECK (fake))
       a INTEGER CONSTRAINT t_a_min_check CHECK ("a" >= 0),
       "b" TEXT DEFAULT 'CHECK (x)' CHECK (length(b) < 3),
       c INTEGER,
       d INTEGER,
       UNIQUE (c, d),
       CONSTRAINT t_c_check CHECK (c > 1),
       CHECK (c < d)
     )`,
    ['id', 'a', 'b', 'c', 'd']
  )
  assert.deepEqual(checks.get('a'), [
    { name: 't_a_min_check', expression: '"a" >= 0' },
  ])
  assert.deepEqual(checks.get('b'), [{ name: '', expression: 'length(b) < 3' }])
  assert.deepEqual(checks.get('c'), [
    { name: 't_c_check', expression: 'c > 1' },
  ])
  assert.equal(checks.has('d'), false)
  assert.equal(checks.has('id'), false)
})

test('checkFingerprint equates quoting and case but not string values', () => {
  assert.equal(
    checkFingerprint(`"status" IN ('a', 'b')`),
    checkFingerprint(`status in ('a','b')`)
  )
  assert.notEqual(
    checkFingerprint(`status IN ('A')`),
    checkFingerprint(`status IN ('a')`)
  )
})

test('checkFingerprint keeps the case of a quoted identifier and of whitespace inside a string', () => {
  assert.notEqual(
    checkFingerprint(`"Qty" >= 0`),
    checkFingerprint(`"qty" >= 0`)
  )
  assert.equal(checkFingerprint(`"Qty" >= 0`), checkFingerprint(`"Qty"  >=  0`))
  assert.equal(checkFingerprint('`Qty` >= 0'), checkFingerprint('qty >= 0'))
  assert.notEqual(
    checkFingerprint(`p <> 'a  b'`),
    checkFingerprint(`p <> 'a b'`)
  )
})

test('mysqlCheckColumn and mysqlCheckEnumValues read what MySQL stores', () => {
  const clause = "(`status` in (_utf8mb4'draft',_utf8mb4'it''s'))"
  assert.equal(mysqlCheckColumn(clause, ['status', 'draft']), 'status')
  assert.deepEqual(mysqlCheckEnumValues(clause), ['draft', "it's"])
  assert.equal(mysqlCheckColumn('(`a` <= `b`)', ['a', 'b']), undefined)
  assert.equal(mysqlCheckEnumValues('(`qty` >= 0)'), undefined)
})
