import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { kysely } from './provider.js'

describe('the kysely provider', () => {
  test('stop destroys the database', async () => {
    const { kysely: db } = (await (kysely as any).dev(
      {},
      { LIBSQL_URL: 'http://localhost:1' }
    )) as { kysely: { stop(): Promise<void>; destroy(): Promise<void> } }
    let destroyed = 0
    db.destroy = async () => void destroyed++
    await db.stop()
    assert.equal(destroyed, 1)
  })
})
