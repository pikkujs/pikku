import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  DummyDriver,
  Kysely,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from 'kysely'
import {
  compilePikkuSchemas,
  pikkuSchemas,
  withUserTable,
  type PikkuSchema,
  type RequiredTypes,
} from './index.js'

/**
 * The SQL the framework schemas compiled to while they were still written as
 * schema-builder statements, captured per schema from that code. Regenerating
 * it from the declarations would prove nothing; it changes only with a
 * deliberate schema change.
 */
type Golden = Record<Dialect, Record<Variant, Record<string, string[]>>>
const golden: Golden = JSON.parse(
  readFileSync(
    new URL('./framework-schemas.golden.json', import.meta.url),
    'utf8'
  )
)

type Dialect = 'sqlite' | 'postgres' | 'mysql'
type Variant = 'plain' | 'app' | 'users'

const dialects = {
  sqlite: [SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler],
  postgres: [PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler],
  mysql: [MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler],
} as const

const compilerFor = (dialect: Dialect) => {
  const [Adapter, Introspector, QueryCompiler] = dialects[dialect]
  return new Kysely<any>({
    dialect: {
      createAdapter: () => new Adapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db: Kysely<any>) => new Introspector(db),
      createQueryCompiler: () => new QueryCompiler(),
    },
  })
}

const variants: Record<
  Variant,
  [PikkuSchema[], RequiredTypes, string | undefined]
> = {
  plain: [pikkuSchemas, {}, undefined],
  app: [pikkuSchemas, { 'user.id': 'uuid' }, 'app'],
  users: [withUserTable(pikkuSchemas, 'users'), {}, undefined],
}

const isCreateTable = (statement: string) => /^create table /i.test(statement)

/**
 * The statement builders interleaved some indexes between tables; a declaration
 * emits its tables, then their indexes, then its extra statements. That
 * rearrangement is the only difference allowed.
 */
const declarationOrder = (statements: string[]) => [
  ...statements.filter(isCreateTable),
  ...statements.filter((statement) => !isCreateTable(statement)),
]

describe('framework schemas compile to the SQL they compiled to before', () => {
  for (const dialect of Object.keys(dialects) as Dialect[]) {
    for (const [variant, [schemas, types, schemaName]] of Object.entries(
      variants
    ) as [Variant, (typeof variants)[Variant]][]) {
      test(`${dialect}, ${variant}`, () => {
        const expected = golden[dialect][variant]
        assert.deepEqual(
          schemas.map((schema) => schema.name),
          Object.keys(expected)
        )
        for (const schema of schemas) {
          const actual = compilePikkuSchemas(
            compilerFor(dialect),
            [schema],
            types,
            schemaName
          )
            .split(';\n\n')
            .map((statement) => statement.replace(/;$/, ''))
          assert.deepEqual(
            actual,
            declarationOrder(expected[schema.name]!),
            `${schema.name} on ${dialect} (${variant})`
          )
        }
      })
    }
  }
})
