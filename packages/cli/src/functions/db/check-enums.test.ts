import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkFingerprint,
  mysqlCheckClause,
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

/**
 * `check_clause` rows exactly as a real MySQL 8.4.13 returns them through mysql2
 * (see the fixture's own header). The server wraps every literal in `\\'`,
 * escapes a quote or a backslash inside a value a second time, puts a charset
 * introducer before each literal, and hands back non-ASCII text as latin1
 * mojibake.
 */
const real = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      'mysql/fixtures/mysql-8.4-check-clauses.json'
    ),
    'utf8'
  )
) as { version: string; rows: { name: string; clause: string }[] }
const realClause = (name: string): string => {
  const row = real.rows.find((r) => r.name === name)
  assert.ok(row, `the fixture has no ${name}`)
  return row.clause
}

test('the fixture is real MySQL output, not a hand-written imitation', () => {
  assert.match(real.version, /^8\.4\./)
  assert.equal(
    realClause('item_color_enum_check'),
    "(`color` in (_utf8mb4\\'red\\',_utf8mb4\\'blue\\'))"
  )
})

test('mysqlCheckEnumValues reads a real MySQL enum check', () => {
  assert.deepEqual(mysqlCheckEnumValues(realClause('item_color_enum_check')), [
    'red',
    'blue',
  ])
})

test('mysqlCheckEnumValues keeps a quote, comma, bracket, backslash, double quote, unicode and the empty string', () => {
  assert.deepEqual(mysqlCheckEnumValues(realClause('item_tricky_enum_check')), [
    "it's",
    'a,b',
    'a)b',
    '(x',
    'back\\slash',
    'say "hi"',
    'é日本',
    '',
  ])
})

test('a real min, max or length check is not an enum', () => {
  for (const name of [
    'item_qty_min_check',
    'item_qty_max_check',
    'item_slug_minlength_check',
    'item_slug_maxlength_check',
    'item_ratio_min_check',
  ]) {
    assert.equal(mysqlCheckEnumValues(realClause(name)), undefined, name)
  }
})

test('mysqlCheckClause turns a real clause into the SQL Pikku writes, so fingerprints agree', () => {
  assert.equal(
    mysqlCheckClause(realClause('item_color_enum_check')),
    "(`color` in ('red','blue'))"
  )
  assert.equal(
    checkFingerprint(mysqlCheckClause(realClause('item_color_enum_check'))),
    checkFingerprint("`color` IN ('red', 'blue')")
  )
  assert.equal(
    checkFingerprint(mysqlCheckClause(realClause('item_tricky_enum_check'))),
    checkFingerprint(
      "`tricky` IN ('it''s', 'a,b', 'a)b', '(x', 'back\\\\slash', 'say \"hi\"', 'é日本', '')"
    )
  )
  assert.equal(
    mysqlCheckClause(realClause('item_qty_min_check')),
    '(`qty` >= 0)'
  )
})

test('every real clause names the column it restricts', () => {
  const columns = ['id', 'color', 'tricky', 'qty', 'slug', 'ratio']
  const owners = Object.fromEntries(
    real.rows.map((r) => [r.name, mysqlCheckColumn(r.clause, columns)])
  )
  assert.deepEqual(owners, {
    item_color_enum_check: 'color',
    item_qty_max_check: 'qty',
    item_qty_min_check: 'qty',
    item_ratio_min_check: 'ratio',
    item_slug_maxlength_check: 'slug',
    item_slug_minlength_check: 'slug',
    item_tricky_enum_check: 'tricky',
  })
})

test('a value that looks like a column does not name one', () => {
  assert.equal(mysqlCheckColumn("(`a` in (_utf8mb4\\'b\\'))", ['a', 'b']), 'a')
})

test('the older forms of a MySQL clause are still read: doubled quotes, no introducer, SHOW CREATE TABLE escapes', () => {
  assert.deepEqual(
    mysqlCheckEnumValues("(`status` in (_utf8mb4'draft',_utf8mb4'it''s'))"),
    ['draft', "it's"]
  )
  assert.deepEqual(mysqlCheckEnumValues("(`s` in ('a','b'))"), ['a', 'b'])
  assert.deepEqual(
    mysqlCheckEnumValues("(`s` in (_utf8mb4'it\\'s',_utf8mb4'back\\\\slash'))"),
    ["it's", 'back\\slash']
  )
  assert.equal(mysqlCheckColumn('(`a` <= `b`)', ['a', 'b']), undefined)
  assert.equal(mysqlCheckEnumValues('(`qty` >= 0)'), undefined)
})

test('a ) inside an enum value does not end the list', () => {
  assert.deepEqual(
    mysqlCheckEnumValues("(`s` in (_utf8mb4\\'a)\\',_utf8mb4\\'b\\'))"),
    ['a)', 'b']
  )
  assert.deepEqual(
    parseCheckEnumsFromDdl(
      `CREATE TABLE t (s TEXT CHECK (s IN ('a)', 'b')))`
    ).get('s'),
    ['a)', 'b']
  )
  assert.deepEqual(
    parseCheckEnumValues("CHECK ((s = ANY (ARRAY['a]'::text, 'b'::text])))"),
    ['a]', 'b']
  )
})

test('a table-level check names its column whatever the case', () => {
  const checks = parseSqliteChecks(
    'CREATE TABLE t (id TEXT, qty INTEGER, CONSTRAINT t_qty_min_check CHECK (QTY >= 0))',
    ['id', 'qty']
  )
  assert.deepEqual(checks.get('qty'), [
    { name: 't_qty_min_check', expression: 'QTY >= 0' },
  ])
  assert.equal(mysqlCheckColumn('(`QTY` >= 0)', ['qty']), 'qty')
})

test("a column-level check that names another column is that column's, not the one it is written on", () => {
  const checks = parseSqliteChecks(
    'CREATE TABLE t (a INTEGER CHECK (b > 0), b INTEGER, c INTEGER CHECK (c < b))',
    ['a', 'b', 'c']
  )
  assert.deepEqual(checks.get('b'), [{ name: '', expression: 'b > 0' }])
  assert.equal(checks.has('a'), false)
  assert.equal(checks.has('c'), false, "a check across two columns is no one's")
})

describe('an enum list holds only literals; a function call or expression in it is not an enum', () => {
  test('mysql: concat() and other calls in the list', () => {
    assert.equal(
      mysqlCheckEnumValues("(`s` in (concat('dr','aft'),'sent'))"),
      undefined
    )
    assert.equal(
      mysqlCheckEnumValues(
        "(`s` in (_utf8mb4\\'a\\',concat(_utf8mb4\\'b\\',_utf8mb4\\'c\\')))"
      ),
      undefined
    )
    assert.equal(mysqlCheckEnumValues("(`s` in (lower('A'),'b'))"), undefined)
    assert.deepEqual(mysqlCheckEnumValues("(`s` in ('a','b'))"), ['a', 'b'])
  })

  test('sqlite: a call or a concatenation in the list', () => {
    for (const list of ["lower('A'), 'b'", "'a' || 'b', 'c'"]) {
      assert.equal(
        parseCheckEnumsFromDdl(`CREATE TABLE t (s TEXT CHECK (s IN (${list})))`)
          .size,
        0,
        list
      )
    }
    assert.deepEqual(
      [
        ...parseCheckEnumsFromDdl(
          `CREATE TABLE t (s TEXT CHECK (s IN ('a', 'it''s')))`
        ),
      ],
      [['s', ['a', "it's"]]]
    )
  })

  test('postgres: a call in the ARRAY', () => {
    assert.equal(
      parseCheckEnumValues(
        "CHECK ((s = ANY (ARRAY[concat('dr'::text, 'aft'::text), 'sent'::text])))"
      ),
      undefined
    )
    assert.deepEqual(
      parseCheckEnumValues(
        "CHECK ((s = ANY (ARRAY['draft'::text, 'sent'::text])))"
      ),
      ['draft', 'sent']
    )
  })
})
