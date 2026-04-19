import type { CoreUserSession } from '@pikku/core'
import type { SessionStore } from '@pikku/core/services'
import type { Db, Collection } from 'mongodb'

interface SessionDoc {
  _id: string
  session: any
  createdAt: Date
  updatedAt: Date
}

export class MongoDBSessionStore implements SessionStore {
  private initialized = false
  private sessions!: Collection<SessionDoc>

  constructor(private db: Db) {}

  public async init(): Promise<void> {
    if (this.initialized) return

    this.sessions = this.db.collection<SessionDoc>('pikkuUserSessions')
    this.initialized = true
  }

  async get(pikkuUserId: string): Promise<CoreUserSession | undefined> {
    const doc = await this.sessions.findOne({ _id: pikkuUserId })
    if (!doc) {
      return undefined
    }
    return doc.session as CoreUserSession
  }

  async set(pikkuUserId: string, session: CoreUserSession): Promise<void> {
    const now = new Date()
    await this.sessions.updateOne(
      { _id: pikkuUserId },
      {
        $set: { session, updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    )
  }

  async clear(pikkuUserId: string): Promise<void> {
    await this.sessions.deleteOne({ _id: pikkuUserId })
  }

  public async close(): Promise<void> {}
}
