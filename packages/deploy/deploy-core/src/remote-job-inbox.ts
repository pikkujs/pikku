import type { DeploymentUnit } from './manifest.js'

/**
 * The two paths `scaffold.remoteJobs` wires into the app itself. Kept as
 * literals rather than imported from `@pikku/core` because deploy-core is
 * dependency-free; they are the values of `REMOTE_QUEUE_JOB_PATH` and
 * `REMOTE_SCHEDULER_JOB_PATH`.
 */
export const REMOTE_JOB_INBOX_PATHS = [
  '/__pikku/queue-job',
  '/__pikku/scheduler-job',
]

/**
 * Whether the unit serves the remote job inbox through its own wirings.
 *
 * Runtimes mount an inbox of their own ahead of route dispatch, which would
 * shadow the wired one along with any middleware in front of it. A generator
 * asks this so the runtime-level shim stands down where the app has already
 * wired the inbox.
 */
export const unitWiresRemoteJobInbox = (unit: DeploymentUnit): boolean =>
  unit.handlers.some(
    (handler) =>
      handler.type === 'fetch' &&
      handler.routes.some((route) =>
        REMOTE_JOB_INBOX_PATHS.includes(route.route)
      )
  )
