import { getSingletonServices } from '../../pikku-state.js'
import {
  holdLease,
  LeaseLostError,
  LeaseTakenError,
} from '../../services/lease-service.js'

/** The run is, or was meanwhile, orchestrated by someone else. */
export const isRunLeaseError = (error: unknown): boolean =>
  error instanceof LeaseTakenError || error instanceof LeaseLostError

const warnedWithoutLease = new WeakSet<object>()

/**
 * Run one orchestration pass under the app's `leaseService`, keyed by run.
 *
 * With no lease service registered the pass runs unguarded, which is right for
 * a single process and wrong for queue workers: the first such pass on a
 * service says so, once.
 */
export const withAppRunLease = async <T>(
  owner: object,
  runId: string,
  fn: () => Promise<T>
): Promise<T> => {
  const services = getSingletonServices()
  const leases = services?.leaseService
  if (leases) {
    return holdLease(leases, `workflow-run:${runId}`, () => fn())
  }
  if (services?.queueService && !warnedWithoutLease.has(owner)) {
    warnedWithoutLease.add(owner)
    services.logger?.warn(
      'Workflow runs are orchestrated through a queue but no leaseService is registered, so two workers can orchestrate the same run at once. Register one (PgKyselyLeaseService, MySQLKyselyLeaseService, or KyselyLeaseService on SQLite) to serialise them.'
    )
  }
  return fn()
}
