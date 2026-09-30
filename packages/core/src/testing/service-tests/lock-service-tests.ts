import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import type { LockLease, LockService } from '../../services/lock-service.js'

const HOUR = 60 * 60 * 1000
/**
 * A lease a test lets lapse, and the lease `withLock` renews. Both leave room
 * for a real database's round-trips: a lease has to outlive the statement that
 * writes it and the one that reads it back.
 */
const SHORT = 500
const RENEWED = 1_000
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Conformance suite for `lockService`. Each test gets a fresh service. */
export const defineLockServiceTests = (
  name: string,
  create: () => Promise<LockService>
): void => {
  describe(`LockService [${name}]`, () => {
    test('one holder at a time', async () => {
      const locks = await create()
      const a = await locks.acquire('stage', 'a', HOUR)
      assert.equal(a?.holder, 'a')
      assert.equal(a?.token, 1)
      assert.equal(await locks.acquire('stage', 'b', HOUR), null)
      assert.equal((await locks.get('stage'))?.holder, 'a')
    })

    test('keys are independent', async () => {
      const locks = await create()
      await locks.acquire('one', 'a', HOUR)
      assert.equal((await locks.acquire('two', 'b', HOUR))?.holder, 'b')
    })

    test('the holder re-acquires under the same token', async () => {
      const locks = await create()
      const first = await locks.acquire('stage', 'a', SHORT)
      const again = await locks.acquire('stage', 'a', HOUR)
      assert.equal(again?.token, first?.token)
      assert.ok(again!.expiresAt > first!.expiresAt)
    })

    test('a lapsed lease passes to the next holder with a higher token', async () => {
      const locks = await create()
      const a = await locks.acquire('stage', 'a', SHORT)
      await wait(2 * SHORT)
      const b = await locks.acquire('stage', 'b', HOUR)
      assert.equal(b?.holder, 'b')
      assert.equal(b?.token, a!.token + 1)
      assert.equal(await locks.refresh(a!, HOUR), null)
    })

    test('release frees the key and the token keeps rising', async () => {
      const locks = await create()
      const a = await locks.acquire('stage', 'a', HOUR)
      await locks.release(a!)
      assert.equal(await locks.get('stage'), null)
      const b = await locks.acquire('stage', 'b', HOUR)
      assert.equal(b?.token, a!.token + 1)
    })

    test('a stale lease cannot refresh or release the new holder', async () => {
      const locks = await create()
      const a = await locks.acquire('stage', 'a', SHORT)
      await wait(2 * SHORT)
      await locks.acquire('stage', 'b', HOUR)
      await locks.release(a!)
      assert.equal((await locks.get('stage'))?.holder, 'b')
    })

    test('refresh extends a live lease', async () => {
      const locks = await create()
      const a = await locks.acquire('stage', 'a', SHORT)
      const refreshed = await locks.refresh(a!, HOUR)
      assert.equal(refreshed?.token, a!.token)
      await wait(2 * SHORT)
      assert.equal(await locks.acquire('stage', 'b', HOUR), null)
    })

    test('concurrent acquires admit exactly one holder', async () => {
      const locks = await create()
      const results = await Promise.all(
        ['a', 'b', 'c', 'd', 'e'].map((holder) =>
          locks.acquire('stage', holder, HOUR)
        )
      )
      assert.equal(results.filter(Boolean).length, 1)
    })
    test('withLock hands the body its lease and frees the key', async () => {
      const locks = await create()
      let seen: LockLease | undefined
      const result = await locks.withLock('stage', async (lease) => {
        seen = lease
        return 42
      })
      assert.equal(result, 42)
      assert.equal(seen?.key, 'stage')
      assert.equal(await locks.get('stage'), null)
    })

    test('withLock refuses a taken key', async () => {
      const locks = await create()
      await locks.acquire('stage', 'a', HOUR)
      await assert.rejects(
        locks.withLock('stage', async () => {}),
        (err: Error) => err.name === 'LockTakenError'
      )
    })

    test('withLock frees the key when the body throws', async () => {
      const locks = await create()
      await assert.rejects(
        locks.withLock('stage', async () => {
          throw new Error('boom')
        }),
        /boom/
      )
      assert.equal(await locks.get('stage'), null)
    })

    test('withLock refuses to vouch for a body that outlived its lease', async () => {
      const locks = await create()
      await assert.rejects(
        locks.withLock(
          'stage',
          async (lease) => {
            await locks.release(lease)
            assert.ok(await locks.acquire('stage', 'other', HOUR))
            await wait(RENEWED)
            return 'unprotected'
          },
          RENEWED
        ),
        (err: Error) => err.name === 'LockLostError'
      )
      assert.equal((await locks.get('stage'))?.holder, 'other')
    })

    test('withLock notices a lease lost after its last renewal', async () => {
      const locks = await create()
      await assert.rejects(
        locks.withLock('stage', async (lease) => {
          await locks.release(lease)
          assert.ok(await locks.acquire('stage', 'other', HOUR))
          return 'finished before any renewal ran'
        }),
        (err: Error) => err.name === 'LockLostError'
      )
      assert.equal((await locks.get('stage'))?.holder, 'other')
    })

    test('withLock aborts the body once its lease is lost', async () => {
      const locks = await create()
      let aborted = false
      await assert.rejects(
        locks.withLock(
          'stage',
          async (lease, signal) => {
            await locks.release(lease)
            assert.ok(await locks.acquire('stage', 'other', HOUR))
            await new Promise<void>((resolve) => {
              signal.addEventListener('abort', () => resolve())
              setTimeout(resolve, 5 * RENEWED)
            })
            aborted = signal.aborted
          },
          RENEWED
        ),
        (err: Error) => err.name === 'LockLostError'
      )
      assert.equal(aborted, true, 'the body was never told its lease was gone')
    })

    test('withLock keeps the lease alive past its ttl', async () => {
      const locks = await create()
      await locks.withLock(
        'stage',
        async () => {
          await wait(2 * RENEWED)
          assert.ok(await locks.get('stage'), 'the lease lapsed mid-body')
        },
        RENEWED
      )
    })
  })
}
