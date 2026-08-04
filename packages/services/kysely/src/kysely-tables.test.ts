import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Kysely, SqliteDialect } from 'kysely'
import Database from 'better-sqlite3'

import { applyPikkuSchemas, ensurePikkuSchema } from './schema/index.js'
import { virtualUserSchema } from './schema/virtual-user.schema.js'

/**
 * Opt-in schemas that still have an interface in `KyselyPikkuDB`, so the drift
 * check covers them too. A table being opt-in says when it is created, not
 * whether its type is allowed to disagree with its DDL.
 */
const OPTIONAL_SCHEMAS = [virtualUserSchema]

/**
 * `KyselyPikkuDB` and the schema declaration describe the same tables, and
 * nothing but this makes them agree.
 *
 * The types stay hand-written on purpose: they carry knowledge introspection
 * cannot recover — `WorkflowStatus` rather than `string`, `Generated<Date>`
 * rather than `Date`, and the comments explaining what a column holds.
 * Generating them from the DDL would trade all of that for one fewer file.
 *
 * What generating would have bought is drift protection, and that is what these
 * tests buy instead: add a column to a schema and forget the interface, or the
 * reverse, and the names stop matching here.
 */

const SOURCE = readFileSync(
  join(import.meta.dirname, 'kysely-tables.ts'),
  'utf8'
)

/** The same transform `CamelCasePlugin` applies to every declared identifier. */
const physical = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()

const interfaceBody = (name: string): string => {
  const start = SOURCE.indexOf(`export interface ${name} {`)
  assert.notEqual(start, -1, `no interface ${name}`)
  const end = SOURCE.indexOf('\n}', start)
  return SOURCE.slice(SOURCE.indexOf('{', start) + 1, end)
}

const fieldsOf = (name: string): string[] =>
  interfaceBody(name)
    .split('\n')
    .map((line) => /^ {2}(\w+)(\??):/.exec(line)?.[1])
    .filter((field): field is string => field !== undefined)

/** `KyselyPikkuDB`'s own table-name → interface-name mapping. */
const tableInterfaces = new Map(
  interfaceBody('KyselyPikkuDB')
    .split('\n')
    .map((line) => /^ {2}(\w+): (\w+)$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => [match[1]!, match[2]!])
)

/** The schema as declared, materialized and read back. */
const declaredSchema = async (): Promise<Map<string, Set<string>>> => {
  const db = new Kysely<any>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
  })
  try {
    // The scope schema's grants reference it, so it has to be there first —
    // the same prerequisite a real project satisfies with Better Auth.
    await db.schema
      .createTable('user')
      .addColumn('id', 'text', (col) => col.primaryKey())
      .execute()
    await applyPikkuSchemas(db)
    for (const schema of OPTIONAL_SCHEMAS) {
      await ensurePikkuSchema(db, schema)
    }

    const tables = await db.introspection.getTables()
    return new Map(
      tables
        .filter((table) => table.name !== 'user')
        .map((table) => [
          table.name,
          new Set(table.columns.map((column) => column.name)),
        ])
    )
  } finally {
    await db.destroy()
  }
}

describe('KyselyPikkuDB tracks the schema declaration', () => {
  test('names every table the declaration creates, and no others', async () => {
    const declared = await declaredSchema()

    const typed = new Set([...tableInterfaces.keys()].map(physical))
    assert.deepEqual(
      [...typed].sort(),
      [...declared.keys()].sort(),
      'a table in one and not the other means the two have drifted apart'
    )
  })

  test('names every column the declaration creates, and no others', async () => {
    const declared = await declaredSchema()

    for (const [key, interfaceName] of tableInterfaces) {
      const table = physical(key)
      const columns = declared.get(table)
      assert.ok(columns, `${table} is declared nowhere`)

      assert.deepEqual(
        fieldsOf(interfaceName).map(physical).sort(),
        [...columns].sort(),
        `${interfaceName} and the '${table}' declaration disagree`
      )
    }
  })
})
