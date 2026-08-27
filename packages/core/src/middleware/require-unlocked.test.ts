import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DataLock,
  type LockRecord,
  type LockVault,
} from '../classification/data-lock.js'
import { DataLockedError } from '../errors/errors.js'
import { requireUnlocked } from './require-unlocked.js'

class InMemoryLockVault implements LockVault {
  constructor(private records: LockRecord[] = []) {}
  async read(): Promise<LockRecord[]> {
    return this.records
  }
  async write(records: LockRecord[]): Promise<void> {
    this.records = records
  }
}

const openLock = async () => {
  const lock = new DataLock(new InMemoryLockVault())
  await lock.init()
  await lock.initialize('correct horse battery staple')
  return lock
}

const run = async (lock: DataLock) => {
  let reached = false
  const middleware = requireUnlocked(lock)
  await middleware({} as never, {} as never, async () => {
    reached = true
  })
  return reached
}

describe('requireUnlocked', () => {
  test('an unlocked store lets the request through', async () => {
    assert.equal(await run(await openLock()), true)
  })

  test('a locked store is refused with a 423', async () => {
    const lock = await openLock()
    lock.lock()

    await assert.rejects(run(lock), DataLockedError)
  })

  test('a locked store never reaches the function', async () => {
    // The point of the gate is that the handler does not run at all — a handler
    // that runs and then fails on decrypt has already touched the database.
    const lock = await openLock()
    lock.lock()

    let reached = false
    const middleware = requireUnlocked(lock)
    await assert.rejects(
      middleware({} as never, {} as never, async () => {
        reached = true
      })
    )
    assert.equal(reached, false)
  })

  test('a store that was never initialized is refused too', async () => {
    const lock = new DataLock(new InMemoryLockVault())
    await lock.init()

    await assert.rejects(run(lock), DataLockedError)
  })
})
