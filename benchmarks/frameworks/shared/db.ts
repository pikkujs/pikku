import { createNodeSqliteKysely } from '@pikku/addon-kysely-node-sqlite'
import type { Kysely } from 'kysely'

/** One driver for every adapter: node:sqlite through the Pikku Kysely dialect (also runs under Bun). No column renaming, no tracing. */
export type BenchDB = Kysely<any>

export const openDb = (filename: string): BenchDB =>
  createNodeSqliteKysely<any>({ filename, camelCase: false })

export type ItemRow = { id: number; name: string; value: number }

/** The one DB read every handler does. */
export const readItem = (db: BenchDB, id: number) =>
  db
    .selectFrom('items')
    .select(['id', 'name', 'value'])
    .where('id', '=', id)
    .executeTakeFirst() as Promise<ItemRow | undefined>
