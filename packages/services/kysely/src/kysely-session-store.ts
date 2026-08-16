import type { SessionStore } from '@pikku/core/services'
import type { CoreUserSession } from '@pikku/core/types'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { parseJson } from './kysely-json.js'
import { ensurePikkuSchema } from './schema/index.js'
import { sessionSchema } from './schema/session.schema.js'

export class KyselySessionStore implements SessionStore {
  private initialized = false

  constructor(private db: Kysely<KyselyPikkuDB>) {}

  public async init(): Promise<void> {
    if (this.initialized) return
    await ensurePikkuSchema(this.db, sessionSchema)
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

    return (parseJson(row.session) ?? undefined) as CoreUserSession | undefined
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
