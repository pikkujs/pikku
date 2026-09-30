import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { defineServiceTests } from '../testing/service-tests.js'
import { InMemoryLeaseService } from './in-memory-lease-service.js'
import { holdLease, type Lease } from './lease-service.js'

defineServiceTests({
  name: 'in-memory',
  services: { leaseService: async () => new InMemoryLeaseService() },
})

/** A store whose refresh throws for as long as `down` is set. */
class UnreachableLeaseService extends InMemoryLeaseService {
  down = false
  refreshes = 0

  async refresh(lease: Lease, ttlMs: number) {
    this.refreshes++
    if (this.down) throw new Error('store unreachable')
    return super.refresh(lease, ttlMs)
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('holdLease when refreshing throws', () => {
  test('a store that is briefly unreachable does not cost the lease', async () => {
    const leases = new UnreachableLeaseService()
    const result = await holdLease(
      leases,
      'stage',
      async (_lease, signal) => {
        leases.down = true
        await wait(150)
        leases.down = false
        await wait(150)
        assert.equal(signal.aborted, false)
        return 'done'
      },
      300
    )
    assert.equal(result, 'done')
    assert.ok(leases.refreshes >= 2)
  })

  test('a store unreachable past the lease aborts the body', async () => {
    const leases = new UnreachableLeaseService()
    let aborted = false
    await assert.rejects(
      holdLease(
        leases,
        'stage',
        async (_lease, signal) => {
          leases.down = true
          await new Promise<void>((resolve) => {
            signal.addEventListener('abort', () => resolve())
            setTimeout(resolve, 2_000)
          })
          aborted = signal.aborted
        },
        300
      ),
      (err: Error) => err.name === 'LeaseLostError'
    )
    assert.equal(aborted, true)
  })

  test('a store unreachable when the body finishes cannot vouch for it', async () => {
    const leases = new UnreachableLeaseService()
    await assert.rejects(
      holdLease(leases, 'stage', async () => {
        leases.down = true
      }),
      (err: Error) => err.name === 'LeaseLostError'
    )
  })
})
