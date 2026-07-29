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
    async getAllColumns() {
      return new Map([['app.widget', columns]])
    },
    async getAllForeignKeys() {
      return new Map()
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

// ── pikku-db-schema.gen.json provenance ──────────────────────────────────────

function multiTableIntrospector(tables: string[]): DbIntrospector {
  const columns = [col({ name: 'id', type: 'text', pk: true })]
  return {
    async listTables() {
      return tables
    },
    async getColumns() {
      return columns
    },
    async getForeignKeys() {
      return []
    },
    async getAllColumns() {
      return new Map(tables.map((t) => [t, columns]))
    },
    async getAllForeignKeys() {
      return new Map()
    },
    async listEnums() {
      return []
    },
    async close() {},
  }
}

async function runSchemaJson(
  tables: string[],
  migrations?: Record<string, string>
) {
  const dir = mkdtempSync(join(tmpdir(), 'db-codegen-provenance-'))
  const migrationsDir = join(dir, 'db', 'postgres')
  if (migrations) {
    mkdirSync(migrationsDir, { recursive: true })
    for (const [name, contents] of Object.entries(migrations)) {
      writeFileSync(join(migrationsDir, name), contents, 'utf8')
    }
  }
  const schemaJsonFile = join(dir, 'pikku-db-schema.gen.json')
  await generateSchemaTypes(multiTableIntrospector(tables), {
    outFile: join(dir, 'schema.gen.ts'),
    coercionFile: join(dir, 'coercion.gen.ts'),
    schemaJsonFile,
    dialect: 'postgres',
    rootDir: dir,
    migrationsDir: migrations ? migrationsDir : undefined,
  })
  return JSON.parse(readFileSync(schemaJsonFile, 'utf8')) as {
    tables: { name: string; source?: string; origin?: string }[]
  }
}

const generatedMigration = (origin: string, body: string) =>
  `-- Generated by \`pikku db generate\` from ${origin}.\n` +
  '-- Re-run the command after changing that source.\n\n' +
  body +
  '\n'

test('the schema JSON attributes each table to whoever declared it', async () => {
  const json = await runSchemaJson(['public.user', 'public.widget'], {
    '0001-better-auth.sql': generatedMigration(
      'pikkuBetterAuth (Better Auth)',
      'CREATE TABLE "user" (id TEXT PRIMARY KEY);'
    ),
    '0002-init.sql': 'CREATE TABLE widget (id TEXT PRIMARY KEY);',
  })

  const byName = new Map(json.tables.map((t) => [t.name, t]))
  assert.equal(byName.get('public.user')?.source, 'better-auth')
  assert.equal(
    byName.get('public.user')?.origin,
    'pikkuBetterAuth (Better Auth)'
  )
  assert.equal(byName.get('public.widget')?.source, 'app')
  assert.equal(byName.get('public.widget')?.origin, undefined)
})

test('a project with no generated migrations owns every table', async () => {
  const json = await runSchemaJson(['public.widget'])
  assert.deepEqual(
    json.tables.map((t) => [t.name, t.source]),
    [['public.widget', 'app']]
  )
})
