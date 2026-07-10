import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateSchemaTypes } from './db-codegen.js'
import type { DbIntrospector, ColumnInfo } from './db-introspector.js'
import { ErrorCode } from '@pikku/inspector'

function col(
  partial: Partial<ColumnInfo> & { name: string; type: string }
): ColumnInfo {
  return { notNull: true, pk: false, defaultValue: null, ...partial }
}

function fakeIntrospector(columns: ColumnInfo[]): DbIntrospector {
  return {
    async listTables() {
      return ['app.widget']
    },
    async getColumns() {
      return columns
    },
    async getForeignKeys() {
      return []
    },
    async listEnums() {
      return []
    },
    async close() {},
  }
}

async function run(
  columns: ColumnInfo[],
  annotations?: Record<string, Record<string, unknown>>
) {
  const dir = mkdtempSync(join(tmpdir(), 'db-codegen-'))
  if (annotations) {
    mkdirSync(join(dir, 'db'), { recursive: true })
    writeFileSync(
      join(dir, 'db', 'annotations.gen.json'),
      JSON.stringify(annotations),
      'utf8'
    )
  }
  return generateSchemaTypes(fakeIntrospector(columns), {
    outFile: join(dir, 'schema.gen.ts'),
    coercionFile: join(dir, 'coercion.gen.ts'),
    dialect: 'postgres',
    rootDir: dir,
  })
}

const jsonWarning = (column: string) =>
  new RegExp(`Column "widget\\.${column}" is .*JSON/JSONB columns need`, 'i')

const hasJsonWarning = (
  warnings: Awaited<ReturnType<typeof run>>['warnings'],
  column: string
) => warnings.some((w) => jsonWarning(column).test(w.message))

test('warns when a jsonb column has no tsType (degrades to unknown)', async () => {
  const result = await run([col({ name: 'spec', type: 'jsonb' })])
  assert.ok(
    hasJsonWarning(result.warnings, 'spec'),
    `expected a json-type warning, got: ${JSON.stringify(result.warnings)}`
  )
})

test('the json warning is a coded warn-severity diagnostic (so --fail-on-warn can gate it)', async () => {
  const result = await run([col({ name: 'spec', type: 'jsonb' })])
  const diagnostic = result.warnings.find((w) =>
    jsonWarning('spec').test(w.message)
  )
  assert.ok(diagnostic, 'expected a json-type diagnostic')
  assert.equal(diagnostic!.code, ErrorCode.DB_JSON_COLUMN_UNTYPED)
  assert.equal(diagnostic!.severity, 'warn')
})

test('warns when a json column is only annotated kind: json (still unknown)', async () => {
  const result = await run([col({ name: 'spec', type: 'jsonb' })], {
    widget: { spec: { kind: 'json' } },
  })
  assert.ok(
    hasJsonWarning(result.warnings, 'spec'),
    `expected a json-type warning, got: ${JSON.stringify(result.warnings)}`
  )
})

test('warns when a json column is explicitly typed unknown (allowed but discouraged)', async () => {
  const result = await run([col({ name: 'spec', type: 'jsonb' })], {
    widget: { spec: { kind: 'json', tsType: 'unknown' } },
  })
  assert.ok(
    hasJsonWarning(result.warnings, 'spec'),
    `expected a json-type warning, got: ${JSON.stringify(result.warnings)}`
  )
})

test('does not warn when a json column has a concrete tsType', async () => {
  const result = await run([col({ name: 'spec', type: 'jsonb' })], {
    widget: { spec: { kind: 'json', tsType: 'WidgetSpec' } },
  })
  assert.ok(
    !hasJsonWarning(result.warnings, 'spec'),
    `expected no json-type warning, got: ${JSON.stringify(result.warnings)}`
  )
})

test('array columns keep their array-ness (text[] → string[], int[] → number[])', async () => {
  const result = await run([
    col({ name: 'tags', type: 'text[]', notNull: false }),
    col({ name: 'scores', type: 'int4[]', notNull: false }),
  ])
  const schema = readFileSync(result.outFile, 'utf8')
  assert.match(
    schema,
    /Private<string\[\]>/,
    `text[] should type as string[], got:\n${schema}`
  )
  assert.match(
    schema,
    /Private<number\[\]>/,
    `int4[] should type as number[], got:\n${schema}`
  )
  assert.doesNotMatch(
    schema,
    /tags:[^\n]*Private<string>[^[]/,
    `text[] must not flatten to a scalar string, got:\n${schema}`
  )
})

test('does not warn for non-json columns', async () => {
  const result = await run([
    col({ name: 'name', type: 'text' }),
    col({ name: 'count', type: 'integer' }),
  ])
  assert.equal(
    result.warnings.filter((w) => /JSON\/JSONB columns need/.test(w.message))
      .length,
    0
  )
})
