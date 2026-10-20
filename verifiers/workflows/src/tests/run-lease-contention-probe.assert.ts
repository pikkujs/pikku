/**
 * How the run lease contention runner decides that a pass ran under the lease.
 *
 * `holdLease` checks the lease once more after its body returns and before it
 * gives the lease back, so there is a window in which the pass is over and the
 * holder is not. A report taken in that window — the second worker is asked
 * for one the moment the last run completes — saw one more pass than holders
 * and failed the bullmq phase (66/67) with every run correct. The window is
 * opened here on purpose, by holding the final lease check.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  holdLease,
  InMemoryLeaseService,
  type Lease,
  type LeaseService,
} from '@pikku/core/services'
import {
  IntervalRecorder,
  RunLeaseProbe,
  passesOutsideLease,
  type Interval,
} from '../runners/run-lease-contention-probe.js'

/** A lease service whose refreshes wait until `letRefreshFinish()`. */
class HeldRefresh implements LeaseService {
  private started!: () => void
  private waiting?: () => void
  readonly refreshing: Promise<void>

  constructor(private inner: LeaseService) {
    this.refreshing = new Promise<void>((resolve) => (this.started = resolve))
  }

  acquire(key: string, holder: string, ttlMs: number) {
    return this.inner.acquire(key, holder, ttlMs)
  }

  async refresh(lease: Lease, ttlMs: number) {
    this.started()
    await new Promise<void>((resolve) => (this.waiting = resolve))
    return this.inner.refresh(lease, ttlMs)
  }

  release(lease: Lease) {
    return this.inner.release(lease)
  }

  get(key: string) {
    return this.inner.get(key)
  }

  letRefreshFinish() {
    this.waiting?.()
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 1))

describe('run lease contention probe', () => {
  test('a pass reported between its end and its lease release still ran under the lease', async () => {
    const leases = new HeldRefresh(new InMemoryLeaseService())
    const probe = new RunLeaseProbe(leases)
    const passes = new IntervalRecorder()

    const run = holdLease(probe, 'workflow-run:r1', () =>
      passes.around('r1', tick)
    )

    // The pass is over; holdLease is in its last lease check.
    await leases.refreshing
    assert.equal(passes.intervals.length, 1)
    assert.equal(
      probe.holders.intervals.length,
      0,
      'counting given-back holders alone sees this pass without one'
    )
    assert.deepEqual(
      passesOutsideLease(passes.intervals, [
        ...probe.holders.intervals,
        ...probe.holders.stillOpen(),
      ]),
      []
    )

    leases.letRefreshFinish()
    await run
    assert.deepEqual(probe.holders.stillOpen(), [])
    assert.deepEqual(
      passesOutsideLease(passes.intervals, probe.holders.intervals),
      []
    )
  })

  test('a pass inside a holder of the same run is under the lease', () => {
    const holders: Interval[] = [['r1', 10, 50]]
    assert.deepEqual(passesOutsideLease([['r1', 12, 40]], holders), [])
  })

  test('a pass with no holder is outside the lease', () => {
    assert.deepEqual(passesOutsideLease([['r1', 12, 40]], []), [['r1', 12, 40]])
  })

  test("another run's holder does not cover a pass", () => {
    const holders: Interval[] = [['r2', 10, 50]]
    assert.deepEqual(passesOutsideLease([['r1', 12, 40]], holders), [
      ['r1', 12, 40],
    ])
  })

  test('a pass that outlives its holder is outside the lease', () => {
    const holders: Interval[] = [['r1', 10, 30]]
    assert.deepEqual(passesOutsideLease([['r1', 12, 40]], holders), [
      ['r1', 12, 40],
    ])
  })

  test('a pass that began before its holder was granted is outside the lease', () => {
    const holders: Interval[] = [['r1', 15, 50]]
    assert.deepEqual(passesOutsideLease([['r1', 12, 40]], holders), [
      ['r1', 12, 40],
    ])
  })
})
