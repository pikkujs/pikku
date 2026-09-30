import type { LeaseService } from '@pikku/core/services'

const releases: Array<Promise<void>> = []

/**
 * Takes a run's lease as another worker would, and releases it after `holdMs`.
 *
 * The pass that dispatched the step may still be holding the lease when the
 * step starts, so acquiring waits for it.
 */
export const holdRunLease = async (
  leaseService: LeaseService,
  runId: string,
  holdMs: number
): Promise<void> => {
  const key = `workflow-run:${runId}`
  const deadline = Date.now() + 10_000
  let lease = await leaseService.acquire(key, 'another-worker', holdMs + 5_000)
  while (!lease) {
    if (Date.now() > deadline) {
      throw new Error(`could not take ${key} as another worker`)
    }
    await new Promise((r) => setTimeout(r, 50))
    lease = await leaseService.acquire(key, 'another-worker', holdMs + 5_000)
  }
  const held = lease
  releases.push(
    new Promise<void>((resolve) =>
      setTimeout(() => {
        void leaseService.release(held).then(() => resolve())
      }, holdMs)
    )
  )
}

export const allReleased = () => Promise.all(releases)
