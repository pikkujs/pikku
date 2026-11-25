import { defineProvider } from '@pikku/core/provider'
import { createBunSqliteKysely } from './create-bun-sqlite-kysely.js'

/**
 * The project's `kysely` over a local SQLite file. A Worker has no file system
 * and a standalone deploy opens its own database, so only `dev` is declared.
 */
export const kysely = defineProvider({
  dev: (_services, env) => {
    const db = createBunSqliteKysely<any>({
      filename: (env.SQLITE_PATH as string | undefined) ?? ':memory:',
    })
    return { kysely: Object.assign(db, { stop: () => db.destroy() }) }
  },
})
