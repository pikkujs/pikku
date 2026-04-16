import type { CoreUserSession } from '@pikku/core'
import type { SessionStore } from '@pikku/core/services'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { parseJson } from './kysely-json.js'

export class KyselySessionStore implements SessionStore {
  private initialized = false

  constructor(private db: Kysely<KyselyPikkuDB>) {}

  public async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.db.schema
      .createTable('pikku_user_sessions')
      .ifNotExists()
      .addColumn('pikku_user_id', 'text', (col) => col.primaryKey())
      .addColumn('session', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .addColumn('updated_at', 'timestamp', (col) =>
        col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
      )
      .execute()

    this.initialized = true
  }

  async get(pikkuUserId: string): Promise<CoreUserSession | undefined> {
    const row = await this.db
      .selectFrom('pikkuUserSessions')
      .select(['session'])
      .where('pikkuUserId', '=', pikkuUserId)
      .executeTakeFirst()

    if (!row) {
      return undefined
    }

    return (parseJson(row.session) ?? undefined) as
      | CoreUserSession
      | undefined
  }

  async set(pikkuUserId: string, session: CoreUserSession): Promise<void> {
    await this.db
      .insertInto('pikkuUserSessions')
      .values({
        pikkuUserId,
        session: JSON.stringify(session),
        updatedAt: new Date(),
      })
      .onConflict((oc) =>
        oc.column('pikkuUserId').doUpdateSet({
          session: JSON.stringify(session),
          updatedAt: new Date(),
        })
      )
      .execute()
  }

  async clear(pikkuUserId: string): Promise<void> {
    await this.db
      .deleteFrom('pikkuUserSessions')
      .where('pikkuUserId', '=', pikkuUserId)
      .execute()
  }
}
