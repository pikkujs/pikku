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

// ─── Column form (at-rest representation) ────────────────────────────────────

test('a wrapped column can only be written with ciphertext, and reads back as both brands', async () => {
  const result = await run([col({ name: 'kek_wrapped', type: 'text' })], {
    widget: { kek_wrapped: { security: 'secret', form: 'wrapped' } },
  })
  const schema = readFileSync(result.outFile, 'utf8')
  // Select keeps the erasable sensitivity brand (the inspector reads it) while
  // carrying the nominal one, so a row read flows straight back into a rewrap.
  assert.match(
    schema,
    /kekWrapped: ColumnType<Secret<WrappedValue>, WrappedValue, WrappedValue>/,
    `expected a wrapped column type, got:\n${schema}`
  )
})

test('the nominal brands are imported from core, never redeclared', async () => {
  const result = await run([col({ name: 'kek_wrapped', type: 'text' })], {
    widget: { kek_wrapped: { security: 'secret', form: 'wrapped' } },
  })
  const schema = readFileSync(result.outFile, 'utf8')
  // A locally declared `unique symbol` would be a DIFFERENT nominal type, so
  // core's own ciphertext would not be assignable to the column it belongs in.
  assert.match(
    schema,
    /import type \{ WrappedValue \} from '@pikku\/core\/classification'/
  )
  assert.doesNotMatch(schema, /declare const wrappedBrand/)
})

test('no form means no import — the brands cost nothing to a project not using them', async () => {
  const result = await run([col({ name: 'name', type: 'text' })])
  const schema = readFileSync(result.outFile, 'utf8')
  assert.doesNotMatch(schema, /@pikku\/core/)
})

test('sealed and hashed brand separately, so one cannot be written where the other belongs', async () => {
  const result = await run(
    [
      col({ name: 'token_hash', type: 'text' }),
      col({ name: 'value_sealed', type: 'text' }),
    ],
    {
      widget: {
        token_hash: { security: 'secret', form: 'hashed' },
        value_sealed: { security: 'secret', form: 'sealed' },
      },
    }
  )
  const schema = readFileSync(result.outFile, 'utf8')
  assert.match(schema, /tokenHash: ColumnType<Secret<HashedValue>/)
  assert.match(schema, /valueSealed: ColumnType<Secret<SealedValue>/)
})

test('a nullable wrapped column stays nullable on every side', async () => {
  const result = await run(
    [col({ name: 'kek_wrapped', type: 'text', notNull: false })],
    { widget: { kek_wrapped: { security: 'secret', form: 'wrapped' } } }
  )
  const schema = readFileSync(result.outFile, 'utf8')
  assert.match(
    schema,
    /kekWrapped: ColumnType<Secret<WrappedValue> \| null, WrappedValue \| null, WrappedValue \| null>/,
    `got:\n${schema}`
  )
})

test('a public column can still declare a form', async () => {
  const result = await run([col({ name: 'email_hash', type: 'text' })], {
    widget: { email_hash: { security: 'public', form: 'hashed' } },
  })
  const schema = readFileSync(result.outFile, 'utf8')
  assert.match(
    schema,
    /emailHash: ColumnType<HashedValue, HashedValue, HashedValue>/,
    `got:\n${schema}`
  )
})

test('legacy security: encrypted still brands as wrapped', async () => {
  const result = await run([col({ name: 'card', type: 'text' })], {
    widget: { card: { security: 'encrypted' } },
  })
  const schema = readFileSync(result.outFile, 'utf8')
  assert.match(schema, /card: ColumnType<Secret<WrappedValue>/)
})

test('warns when a secret column has not said how it is held', async () => {
  const result = await run([col({ name: 'host_token', type: 'text' })], {
    widget: { host_token: { security: 'secret' } },
  })
  const diagnostic = result.warnings.find(
    (w) => w.code === ErrorCode.DB_SECRET_COLUMN_STORED_PLAIN
  )
  assert.ok(
    diagnostic,
    `expected a plain-secret warning: ${JSON.stringify(result.warnings)}`
  )
  assert.equal(diagnostic!.severity, 'warn')
  assert.match(diagnostic!.message, /host_token/)
})

test("an explicit form: 'plain' is the acknowledgement that silences the warning", async () => {
  const result = await run([col({ name: 'host_token', type: 'text' })], {
    widget: { host_token: { security: 'secret', form: 'plain' } },
  })
  assert.equal(
    result.warnings.find(
      (w) => w.code === ErrorCode.DB_SECRET_COLUMN_STORED_PLAIN
    ),
    undefined
  )
})

test('a non-secret column is never asked how it is held', async () => {
  const result = await run([col({ name: 'name', type: 'text' })], {
    widget: { name: { security: 'private' } },
  })
  assert.equal(
    result.warnings.find(
      (w) => w.code === ErrorCode.DB_SECRET_COLUMN_STORED_PLAIN
    ),
    undefined
  )
})

test('a form on a non-text column is reported once and dropped, not compiled into a broken type', async () => {
  const result = await run([col({ name: 'invoker_secret', type: 'bytea' })], {
    widget: { invoker_secret: { security: 'secret', form: 'wrapped' } },
  })
  const schema = readFileSync(result.outFile, 'utf8')
  assert.doesNotMatch(schema, /WrappedValue/)

  const codes = result.warnings.map((w) => w.code)
  assert.ok(codes.includes(ErrorCode.DB_FORM_ON_NON_STRING))
  // The column DID declare a form, so it is not also nagged for staying silent.
  assert.ok(!codes.includes(ErrorCode.DB_SECRET_COLUMN_STORED_PLAIN))
})

// ── defaultSchema ────────────────────────────────────────────────────────────

async function runTables(tables: string[], defaultSchema?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'db-codegen-schema-'))
  const result = await generateSchemaTypes(multiTableIntrospector(tables), {
    outFile: join(dir, 'schema.gen.ts'),
    coercionFile: join(dir, 'coercion.gen.ts'),
    dialect: 'postgres',
    defaultSchema,
    rootDir: dir,
  })
  return { result, schema: readFileSync(join(dir, 'schema.gen.ts'), 'utf8') }
}

test('without defaultSchema a table stays schema-qualified', async () => {
  const { schema } = await runTables(['app.widget'])
  assert.match(schema, /export interface AppWidget \{/)
  assert.match(schema, /"app\.widget": AppWidget/)
})

test('defaultSchema drops the qualifier from the DB key and the interface', async () => {
  const { schema } = await runTables(['app.widget'], 'app')
  assert.match(schema, /export interface Widget \{/)
  assert.match(schema, /^ {2}widget: Widget$/m)
  assert.doesNotMatch(schema, /AppWidget/)
})

test('a table in another schema keeps its qualifier', async () => {
  const { schema } = await runTables(['app.widget', 'audit.entry'], 'app')
  assert.match(schema, /^ {2}widget: Widget$/m)
  assert.match(schema, /"audit\.entry": AuditEntry/)
})

test('a name collision keeps the qualifier and warns rather than shadowing', async () => {
  // Two tables that would both become `widget` is a generated type where one
  // silently wins; the queries against the loser then typecheck against the
  // wrong columns.
  const { result, schema } = await runTables(['widget', 'app.widget'], 'app')
  assert.equal(
    result.warnings.filter(
      (w) => w.code === ErrorCode.DB_DEFAULT_SCHEMA_NAME_COLLISION
    ).length,
    1
  )
  assert.match(schema, /"app\.widget": AppWidget/)
  assert.match(schema, /^ {2}widget: Widget$/m)
})

test('no collision warning when nothing collides', async () => {
  const { result } = await runTables(['app.widget'], 'app')
  assert.equal(
    result.warnings.some(
      (w) => w.code === ErrorCode.DB_DEFAULT_SCHEMA_NAME_COLLISION
    ),
    false
  )
})

// ─── Column key scoping (keyId) ──────────────────────────────────────────────

async function runManifest(
  columns: ColumnInfo[],
  annotations?: Record<string, Record<string, unknown>>
) {
  const dir = mkdtempSync(join(tmpdir(), 'db-codegen-manifest-'))
  if (annotations) {
    mkdirSync(join(dir, 'db'), { recursive: true })
    writeFileSync(
      join(dir, 'db', 'annotations.gen.json'),
      JSON.stringify(annotations),
      'utf8'
    )
  }
  const result = await generateSchemaTypes(fakeIntrospector(columns), {
    outFile: join(dir, 'schema.gen.ts'),
    coercionFile: join(dir, 'coercion.gen.ts'),
    manifestFile: join(dir, 'classification.gen.ts'),
    dialect: 'postgres',
    rootDir: dir,
  })
  return readFileSync(join(dir, 'classification.gen.ts'), 'utf8')
}

test('a wrapped column that names no key is protected by the default one', async () => {
  const manifest = await runManifest([col({ name: 'ssn', type: 'text' })], {
    widget: { ssn: { security: 'secret', form: 'wrapped' } },
  })
  assert.match(manifest, /"ssn": \{ classification: 'secret'.*keyId: 'default'/)
})

test('a column naming its own key keeps it', async () => {
  const manifest = await runManifest(
    [col({ name: 'recovery', type: 'text' })],
    {
      widget: {
        recovery: {
          security: 'secret',
          form: 'wrapped',
          keyId: 'recovery-codes',
        },
      },
    }
  )
  assert.match(manifest, /"recovery": \{.*keyId: 'recovery-codes'/)
})

test('a sealed column carries a key too', async () => {
  const manifest = await runManifest([col({ name: 'blob', type: 'text' })], {
    widget: { blob: { security: 'secret', form: 'sealed', keyId: 'vault' } },
  })
  assert.match(manifest, /"blob": \{.*keyId: 'vault'/)
})

test('a hashed column names no key — a hash is not opened by one', async () => {
  const manifest = await runManifest(
    [col({ name: 'token_hash', type: 'text' })],
    { widget: { token_hash: { security: 'secret', form: 'hashed' } } }
  )
  assert.doesNotMatch(manifest, /"token_hash": \{[^}]*keyId/)
})

test('an unencrypted column names no key, so the manifest cannot imply protection it has not got', async () => {
  const manifest = await runManifest([col({ name: 'name', type: 'text' })], {
    widget: { name: { security: 'public' } },
  })
  assert.doesNotMatch(manifest, /"name": \{[^}]*keyId/)
})

test('coercion.gen.ts says what has to consume it', async () => {
  // The map is generated complete and correct and then applied by nobody. It
  // is invisible locally — the dev driver hydrates a TEXT date into a Date on
  // its own — and fatal on a deployed stage, which returns the raw string.
  const dir = mkdtempSync(join(tmpdir(), 'db-codegen-coercion-'))
  mkdirSync(join(dir, 'db'), { recursive: true })
  writeFileSync(
    join(dir, 'db', 'annotations.gen.json'),
    JSON.stringify({ widget: { created_at: { kind: 'date' } } }),
    'utf8'
  )
  const coercionFile = join(dir, 'coercion.gen.ts')
  await generateSchemaTypes(
    fakeIntrospector([col({ name: 'created_at', type: 'text' })]),
    {
      outFile: join(dir, 'schema.gen.ts'),
      coercionFile,
      dialect: 'postgres',
      rootDir: dir,
    }
  )

  const generated = readFileSync(coercionFile, 'utf8')
  assert.match(generated, /"created_at": "date"/)
  assert.match(generated, /Nothing applies this for you/)
  assert.match(generated, /createCoercionPlugin/)
  assert.match(generated, /createSingletonServices/)
})
