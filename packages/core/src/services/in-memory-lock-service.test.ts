import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { defineServiceTests } from '../testing/service-tests.js'
import { InMemoryLockService } from './in-memory-lock-service.js'
import type { LockLease } from './lock-service.js'

defineServiceTests({
  name: 'in-memory',
  services: { lockService: async () => new InMemoryLockService() },
})

/** A store whose refresh throws for as long as `down` is set. */
class UnreachableLockService extends InMemoryLockService {
  down = false
  refreshes = 0

  async refresh(lease: LockLease, ttlMs: number) {
    this.refreshes++
    if (this.down) throw new Error('store unreachable')
    return super.refresh(lease, ttlMs)
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('withLock when refreshing throws', () => {
  test('a store that is briefly unreachable does not cost the lease', async () => {
    const locks = new UnreachableLockService()
    const result = await locks.withLock(
      'stage',
      async (_lease, signal) => {
        locks.down = true
        await wait(150)
        locks.down = false
        await wait(150)
        assert.equal(signal.aborted, false)
        return 'done'
      },
      300
    )
    assert.equal(result, 'done')
    assert.ok(locks.refreshes >= 2)
  })

  test('a store unreachable past the lease aborts the body', async () => {
    const locks = new UnreachableLockService()
    let aborted = false
    await assert.rejects(
      locks.withLock(
        'stage',
        async (_lease, signal) => {
          locks.down = true
          await new Promise<void>((resolve) => {
            signal.addEventListener('abort', () => resolve())
            setTimeout(resolve, 2_000)
          })
          aborted = signal.aborted
        },
        300
      ),
      (err: Error) => err.name === 'LockLostError'
    )
    assert.equal(aborted, true)
  })

  test('a store unreachable when the body finishes cannot vouch for it', async () => {
    const locks = new UnreachableLockService()
    await assert.rejects(
      locks.withLock('stage', async () => {
        locks.down = true
      }),
      (err: Error) => err.name === 'LockLostError'
    )
  })
})
