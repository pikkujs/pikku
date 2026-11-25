import Database from 'better-sqlite3'
import type { D1Database } from '@cloudflare/workers-types'
import { defineServiceTests } from '@pikku/core/testing'
import { KyselyRateLimitService } from '@pikku/addon-kysely'
import { createD1Kysely } from './cloudflare-d1-services.js'

/**
 * A D1 binding over SQLite. It answers the way D1 does for the one call
 * `kysely-d1` makes: `prepare(sql).bind(...).all()`, with the rows in `results`
 * and the count of rows a write changed in `meta.changes`. That count is what
 * decides whether a rate-limit hit was admitted, so it is the thing to prove.
 */
const d1Over = (sqlite: Database.Database): D1Database => {
  const prepare = (sql: string) => {
    let params: unknown[] = []
    const statement = {
      bind: (...values: unknown[]) => {
        params = values
        return statement
      },
      all: async () => {
        const compiled = sqlite.prepare(sql)
        if (compiled.reader) {
          return { results: compiled.all(...params), meta: { changes: 0 } }
        }
        const info = compiled.run(...params)
        return {
          results: [],
          meta: {
            changes: info.changes,
            last_row_id: Number(info.lastInsertRowid),
          },
        }
      },
    }
    return statement
  }
  return { prepare } as unknown as D1Database
}

defineServiceTests({
  name: 'cloudflare d1',
  services: {
    rateLimitService: async () => {
      const sqlite = new Database(':memory:')
      // D1 has no transactions, so its table comes from a migration, not from
      // `applyPikkuSchemas`.
      sqlite.exec(
        'create table "pikku_rate_limit" ("key" text primary key, "count" integer not null, "reset_at" bigint not null)'
      )
      const db = createD1Kysely(d1Over(sqlite))
      const service = new KyselyRateLimitService(db)
      await service.init()
      return service
    },
  },
})
