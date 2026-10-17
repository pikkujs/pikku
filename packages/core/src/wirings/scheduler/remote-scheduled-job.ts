import { BadRequestError } from '../../errors/errors.js'
import type { Logger } from '../../services/logger.js'
import type { RemoteScheduledJobData } from '../../services/remote-jobs.js'
import {
  ScheduledTaskNotFoundError,
  runScheduledTask,
} from './scheduler-runner.js'

/**
 * Runs a scheduled task on behalf of a remote job runner, so a task can be triggered in a deployment unit other than the one that scheduled it.
 * Generated remote-job wiring calls this; apps do not call it directly.
 *
 * @throws {BadRequestError} When the named task is not wired in this unit.
 */
export async function pikkuRemoteScheduledJobFunc(
  { logger }: { logger: Logger },
  { taskName }: RemoteScheduledJobData
): Promise<void> {
  try {
    await runScheduledTask({ name: taskName, traceId: `cron-${taskName}` })
  } catch (error) {
    if (error instanceof ScheduledTaskNotFoundError) {
      throw new BadRequestError(error.message)
    }
    logger.error(
      `remote-jobs: task '${taskName}' failed: ${error instanceof Error ? error.message : String(error)}`
    )
    throw error
  }
}
