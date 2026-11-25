import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { kysely } from './provider.js'

describe('the kysely provider', () => {
  test('stop destroys the database', async () => {
    const { kysely: db } = (await (kysely as any).dev(
      {},
      { DATABASE_URL: 'mysql://u:p@localhost:1/db' }
    )) as { kysely: { stop(): Promise<void>; destroy(): Promise<void> } }
    let destroyed = 0
    db.destroy = async () => void destroyed++
    await db.stop()
    assert.equal(destroyed, 1)
  })
})
