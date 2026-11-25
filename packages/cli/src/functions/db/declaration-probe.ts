import { sql, type Kysely } from 'kysely'
import type { TablesDeclaration } from '@pikku/core/db'
import { applyPikkuSchemas } from '@pikku/addon-kysely'

/** A declared `default` or `onUpdate` that has to be run to be believed. */
interface Probe {
  table: string
  column: string
  field: 'default' | 'onUpdate'
}

const probesOf = (tables: TablesDeclaration): Probe[] =>
  Object.entries(tables).flatMap(([table, declaration]) =>
    Object.entries(declaration.columns).flatMap(([column, declared]) => [
      ...(typeof declared.default === 'object' && 'sql' in declared.default
        ? [{ table, column, field: 'default' as const }]
        : []),
      ...(declared.onUpdate !== undefined
        ? [{ table, column, field: 'onUpdate' as const }]
        : []),
    ])
  )

/** Whether a declaration has anything `runDeclaredSql` would run. */
export const hasDeclaredSql = (tables: TablesDeclaration): boolean =>
  probesOf(tables).length > 0

/**
 * Run every declared `default: { sql }` and `onUpdate` on the throwaway
 * database the declaration was applied to, and say what failed.
 *
 * Each one gets a probe table of its own with the column in the declared type, so
 * a default that does not fit the type fails on the insert and an `onUpdate`
 * trigger has to survive an UPDATE that leaves its column alone, which is where
 * a trigger that fires itself again would loop. Syntax and a missing engine key
 * already fail when the declaration is applied.
 */
export async function runDeclaredSql(
  db: Kysely<any>,
  tables: TablesDeclaration
): Promise<string[]> {
  const problems: string[] = []
  let index = 0
  for (const { table, column, field } of probesOf(tables)) {
    const declared = tables[table]!.columns[column]!
    const at = `${table}.${column}`
    if (!declared.type) continue
    const probe = `pikku_probe_${index++}`
    try {
      await applyPikkuSchemas(db, [
        {
          name: 'declaration-probe',
          tables: {
            [probe]: {
              columns: {
                id: { type: 'integer', primaryKey: true },
                touched: { type: 'integer' },
                value: {
                  type: declared.type,
                  [field]: declared[field],
                } as never,
              },
            },
          },
        },
      ])
      await sql`insert into ${sql.table(probe)} (id) values (1)`.execute(db)
      await sql`update ${sql.table(probe)} set touched = 1`.execute(db)
      if (field === 'onUpdate') {
        const row = await sql<{
          value: unknown
        }>`select value from ${sql.table(probe)}`.execute(db)
        if (row.rows[0]?.value === undefined) {
          problems.push(
            `${at} onUpdate left the column unset after an UPDATE that did not name it.`
          )
        }
      }
    } catch (error: any) {
      problems.push(`${at} ${field} did not run: ${error.message}.`)
    }
  }
  return problems
}
