/** The variable holding the shared secret every remote job must present. */
export const REMOTE_JOBS_SECRET_VARIABLE = 'PIKKU_DISPATCH_SECRET'

export const REMOTE_JOBS_SECRET_HEADER = 'x-pikku-dispatch'

export const REMOTE_QUEUE_JOB_PATH = '/__pikku/queue-job'

export const REMOTE_SCHEDULER_JOB_PATH = '/__pikku/scheduler-job'

export interface RemoteQueueJobData {
  queueName: string
  data?: unknown
  jobId?: string
  traceId?: string
}

export interface RemoteScheduledJobData {
  taskName: string
}
