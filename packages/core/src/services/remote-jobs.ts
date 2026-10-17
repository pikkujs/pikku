/** The variable holding the shared secret every remote job must present. */
export const REMOTE_JOBS_SECRET_VARIABLE = 'PIKKU_DISPATCH_SECRET'

/** The header a remote job request carries the dispatch secret in. */
export const REMOTE_JOBS_SECRET_HEADER = 'x-pikku-dispatch'

/** The HTTP path a deployment receives remote queue jobs on. */
export const REMOTE_QUEUE_JOB_PATH = '/__pikku/queue-job'

/** The HTTP path a deployment receives remote scheduled tasks on. */
export const REMOTE_SCHEDULER_JOB_PATH = '/__pikku/scheduler-job'

/** A queue job delivered over HTTP to {@link REMOTE_QUEUE_JOB_PATH}. */
export interface RemoteQueueJobData {
  queueName: string
  data?: unknown
  jobId?: string
  traceId?: string
}

/**
 * A scheduled task run delivered over HTTP to {@link
 * REMOTE_SCHEDULER_JOB_PATH}.
 */
export interface RemoteScheduledJobData {
  taskName: string
}
