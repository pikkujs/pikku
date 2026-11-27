import {
  leaseRenewalIntervalMs,
  type Lease,
  type LeaseService,
} from '../../services/lease-service.js'
import { InMemoryLeaseService } from '../../services/in-memory-lease-service.js'
import { InMemoryWorkflowService } from './in-memory-workflow-service.js'
import { PikkuWorkflowService } from './pikku-workflow-service.js'

/** The wait between two renewals of a run's lease. */
const RUN_LEASE_RENEWAL_MS = leaseRenewalIntervalMs(30_000)

/**
 * Renew leases every few milliseconds, so a test can lose one without sitting
 * out the real interval. Returns how to put the timers back.
 */
export const fastLeaseRenewals = (
  intervals: readonly number[] = [RUN_LEASE_RENEWAL_MS]
): (() => void) => {
  const real = globalThis.setTimeout
  globalThis.setTimeout = ((handler: any, ms?: number, ...args: any[]) =>
    real(
      handler,
      intervals.includes(ms!) ? 5 : ms,
      ...args
    )) as typeof setTimeout
  return () => {
    globalThis.setTimeout = real
  }
}

export const gate = () => {
  let open!: () => void
  const passed = new Promise<void>((resolve) => (open = resolve))
  return { open, passed }
}

/** Resolves `true` once `condition` holds, or `false` after `ms`. */
export const until = async (
  condition: () => boolean,
  ms = 5_000
): Promise<boolean> => {
  const deadline = Date.now() + ms
  while (!condition()) {
    if (Date.now() > deadline) return false
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return true
}

export const runLeaseKey = (runId: string) => `workflow-run:${runId}`

/** Every holder is told it still has its lease, until the test takes it away. */
export class ScriptedLeases extends InMemoryLeaseService {
  readonly granted: Lease[] = []
  readonly lost = new Set<number>()
  /** Keys another process has, which nothing here can acquire. */
  readonly takenElsewhere = new Set<string>()
  /** Set to have every acquire fail, as when the lease store is unreachable. */
  unreachable = false
  private readonly clock: { skew: number }

  constructor() {
    const clock = { skew: 0 }
    super(() => Date.now() + clock.skew)
    this.clock = clock
  }

  lapse() {
    this.clock.skew += 60_000
  }

  /** The run's current holder fails to renew from now on. */
  lose(runId: string) {
    const held = this.granted.filter(({ key }) => key === runLeaseKey(runId))
    this.lost.add(held.at(-1)!.token)
  }

  /** `lose`, with another process taking the run. */
  loseToAnother(runId: string) {
    this.takenElsewhere.add(runLeaseKey(runId))
    this.lose(runId)
  }

  override async acquire(key: string, holder: string, ttlMs: number) {
    if (this.unreachable) throw new Error('lease store unreachable')
    if (this.takenElsewhere.has(key)) return null
    const lease = await super.acquire(key, holder, ttlMs)
    if (lease) this.granted.push(lease)
    return lease
  }

  override async refresh(lease: Lease): Promise<Lease | null> {
    return this.lost.has(lease.token) ? null : lease
  }
}

/** In-memory storage behind the real run lease, as a persistent store has it. */
export class LeasedWorkflowService extends InMemoryWorkflowService {
  protected override readonly leaseService: LeaseService

  constructor(readonly leases = new ScriptedLeases()) {
    super()
    this.leaseService = leases
  }

  override withRunLease<T>(
    id: string,
    fn: (lost?: AbortSignal) => Promise<T>
  ): Promise<T> {
    return PikkuWorkflowService.prototype.withRunLease.call(
      this,
      id,
      fn
    ) as Promise<T>
  }
}

/** Long enough for a lost lease to have been noticed by a renewal. */
export const afterRenewal = () =>
  new Promise((resolve) => setTimeout(resolve, 40))
