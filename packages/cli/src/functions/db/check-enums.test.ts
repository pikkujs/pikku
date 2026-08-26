import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseCheckEnumValues,
  parseCheckEnumsFromDdl,
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
