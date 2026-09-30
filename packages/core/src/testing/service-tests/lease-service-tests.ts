import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  holdLease,
  type Lease,
  type LeaseService,
} from '../../services/lease-service.js'

const HOUR = 60 * 60 * 1000
/**
 * A lease a test lets lapse, and the lease `holdLease` renews. Both leave room
 * for a real database's round-trips: a lease has to outlive the statement that
 * writes it and the one that reads it back.
 */
const SHORT = 500
const RENEWED = 1_000
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Conformance suite for `leaseService`. Each test gets a fresh service. */
export const defineLeaseServiceTests = (
  name: string,
  create: () => Promise<LeaseService>
): void => {
  describe(`LeaseService [${name}]`, () => {
    test('one holder at a time', async () => {
      const leases = await create()
      const a = await leases.acquire('stage', 'a', HOUR)
      assert.equal(a?.holder, 'a')
      assert.equal(a?.token, 1)
      assert.equal(await leases.acquire('stage', 'b', HOUR), null)
      assert.equal((await leases.get('stage'))?.holder, 'a')
    })

    test('keys are independent', async () => {
      const leases = await create()
      await leases.acquire('one', 'a', HOUR)
      assert.equal((await leases.acquire('two', 'b', HOUR))?.holder, 'b')
    })

    test('the holder re-acquires under the same token', async () => {
      const leases = await create()
      const first = await leases.acquire('stage', 'a', SHORT)
      const again = await leases.acquire('stage', 'a', HOUR)
      assert.equal(again?.token, first?.token)
      assert.ok(again!.expiresAt > first!.expiresAt)
    })

    test('a lapsed lease passes to the next holder with a higher token', async () => {
      const leases = await create()
      const a = await leases.acquire('stage', 'a', SHORT)
      await wait(2 * SHORT)
      const b = await leases.acquire('stage', 'b', HOUR)
      assert.equal(b?.holder, 'b')
      assert.equal(b?.token, a!.token + 1)
      assert.equal(await leases.refresh(a!, HOUR), null)
    })

    test('release frees the key and the token keeps rising', async () => {
      const leases = await create()
      const a = await leases.acquire('stage', 'a', HOUR)
      await leases.release(a!)
      assert.equal(await leases.get('stage'), null)
      const b = await leases.acquire('stage', 'b', HOUR)
      assert.equal(b?.token, a!.token + 1)
    })

    test('a stale lease cannot refresh or release the new holder', async () => {
      const leases = await create()
      const a = await leases.acquire('stage', 'a', SHORT)
      await wait(2 * SHORT)
      await leases.acquire('stage', 'b', HOUR)
      await leases.release(a!)
      assert.equal((await leases.get('stage'))?.holder, 'b')
    })

    test('refresh extends a live lease', async () => {
      const leases = await create()
      const a = await leases.acquire('stage', 'a', SHORT)
      const refreshed = await leases.refresh(a!, HOUR)
      assert.equal(refreshed?.token, a!.token)
      await wait(2 * SHORT)
      assert.equal(await leases.acquire('stage', 'b', HOUR), null)
    })

    test('concurrent acquires admit exactly one holder', async () => {
      const leases = await create()
      const results = await Promise.all(
        ['a', 'b', 'c', 'd', 'e'].map((holder) =>
          leases.acquire('stage', holder, HOUR)
        )
      )
      assert.equal(results.filter(Boolean).length, 1)
    })
    test('holdLease hands the body its lease and frees the key', async () => {
      const leases = await create()
      let seen: Lease | undefined
      const result = await holdLease(leases, 'stage', async (lease) => {
        seen = lease
        return 42
      })
      assert.equal(result, 42)
      assert.equal(seen?.key, 'stage')
      assert.equal(await leases.get('stage'), null)
    })

    test('holdLease refuses a taken key', async () => {
      const leases = await create()
      await leases.acquire('stage', 'a', HOUR)
      await assert.rejects(
        holdLease(leases, 'stage', async () => {}),
        (err: Error) => err.name === 'LeaseTakenError'
      )
    })

    test('holdLease frees the key when the body throws', async () => {
      const leases = await create()
      await assert.rejects(
        holdLease(leases, 'stage', async () => {
          throw new Error('boom')
        }),
        /boom/
      )
      assert.equal(await leases.get('stage'), null)
    })

    test('holdLease refuses to vouch for a body that outlived its lease', async () => {
      const leases = await create()
      await assert.rejects(
        holdLease(
          leases,
          'stage',
          async (lease) => {
            await leases.release(lease)
            assert.ok(await leases.acquire('stage', 'other', HOUR))
            await wait(RENEWED)
            return 'unprotected'
          },
          RENEWED
        ),
        (err: Error) => err.name === 'LeaseLostError'
      )
      assert.equal((await leases.get('stage'))?.holder, 'other')
    })

    test('holdLease notices a lease lost after its last renewal', async () => {
      const leases = await create()
      await assert.rejects(
        holdLease(leases, 'stage', async (lease) => {
          await leases.release(lease)
          assert.ok(await leases.acquire('stage', 'other', HOUR))
          return 'finished before any renewal ran'
        }),
        (err: Error) => err.name === 'LeaseLostError'
      )
      assert.equal((await leases.get('stage'))?.holder, 'other')
    })

    test('holdLease aborts the body once its lease is lost', async () => {
      const leases = await create()
      let aborted = false
      await assert.rejects(
        holdLease(
          leases,
          'stage',
          async (lease, signal) => {
            await leases.release(lease)
            assert.ok(await leases.acquire('stage', 'other', HOUR))
            await new Promise<void>((resolve) => {
              signal.addEventListener('abort', () => resolve())
              setTimeout(resolve, 5 * RENEWED)
            })
            aborted = signal.aborted
          },
          RENEWED
        ),
        (err: Error) => err.name === 'LeaseLostError'
      )
      assert.equal(aborted, true, 'the body was never told its lease was gone')
    })

    test('holdLease keeps the lease alive past its ttl', async () => {
      const leases = await create()
      await holdLease(
        leases,
        'stage',
        async () => {
          await wait(2 * RENEWED)
          assert.ok(await leases.get('stage'), 'the lease lapsed mid-body')
        },
        RENEWED
      )
    })
  })
}
