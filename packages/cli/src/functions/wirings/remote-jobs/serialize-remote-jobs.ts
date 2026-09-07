export interface RemoteJobsGenOutput {
  schemas: string
  functions: string
}

/**
 * Generate the remote-jobs inbox: the HTTP routes an external dispatcher posts
 * to so a runtime that holds neither a queue consumer nor a clock still runs
 * its queue workers and scheduled tasks.
 *
 * Ordinary `wireHTTP` routes rather than runtime-level handlers, so every
 * runtime serves them from one implementation, and the secret check is
 * middleware a deployment can sit its own scheme in front of. The routes are
 * literals rather than the constants core exports, because the inspector reads
 * them statically to build the HTTP map.
 */
export const serializeRemoteJobs = (
  leaf: (name: string) => string
): RemoteJobsGenOutput => {
  const schemas = `/**
 * Auto-generated remote job inbox schemas
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { z } from 'zod'

export const RemoteQueueJob = z.object({
  queueName: z.string(),
  data: z.unknown().optional(),
  jobId: z.string().optional(),
  traceId: z.string().optional(),
})

export const RemoteScheduledJob = z.object({
  taskName: z.string(),
})
`

  const functions = `/**
 * Auto-generated remote job inbox
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc } from '${leaf('function')}'
import { wireHTTP } from '${leaf('http')}'
import {
  pikkuRemoteQueueJobFunc,
  pikkuRemoteScheduledJobFunc,
} from '@pikku/core/services'
import { remoteJobsSecret } from '@pikku/core/middleware'
import { RemoteQueueJob, RemoteScheduledJob } from './remote-jobs.schemas.gen.js'

const runRemoteQueueJob = pikkuSessionlessFunc({
  auth: false,
  input: RemoteQueueJob,
  tags: ['pikku'],
  description: 'Runs one queue worker for a job delivered by an external dispatcher.',
  func: async ({ logger }, data) => pikkuRemoteQueueJobFunc({ logger }, data),
})

const runRemoteScheduledJob = pikkuSessionlessFunc({
  auth: false,
  input: RemoteScheduledJob,
  tags: ['pikku'],
  description: 'Runs one scheduled task for a tick delivered by an external scheduler.',
  func: async ({ logger }, data) => pikkuRemoteScheduledJobFunc({ logger }, data),
})

wireHTTP({
  method: 'post',
  route: '/__pikku/queue-job',
  auth: false,
  tags: ['pikku'],
  func: runRemoteQueueJob,
  middleware: [remoteJobsSecret],
})

wireHTTP({
  method: 'post',
  route: '/__pikku/scheduler-job',
  auth: false,
  tags: ['pikku'],
  func: runRemoteScheduledJob,
  middleware: [remoteJobsSecret],
})
`

  return { schemas, functions }
}
