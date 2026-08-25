/**
 * Generates type definitions for scheduler wirings
 */
export const serializeSchedulerTypes = (
  functionTypesImportPath: string,
  middlewareTypesImportPath: string,
  { addon = false }: { addon?: boolean } = {}
) => {
  return `/**
 * Scheduler-specific type definitions for tree-shaking optimization
 */

${addon ? '' : `import { wireScheduler as wireSchedulerCore } from '@pikku/core/scheduler'\n`}${
    addon
      ? ''
      : `import { CoreScheduledTask } from '@pikku/core/scheduler'
import type { PikkuFunctionConfig, Session } from '${functionTypesImportPath}'
import type { PikkuMiddleware } from '${middlewareTypesImportPath}'

/**
 * Type definition for scheduled tasks that run at specified intervals.
 * The function is sessionless — a cron has no caller — but the task may declare
 * the \`session\` it runs as, which is what lets it invoke a gated RPC.
 */
type SchedulerWiring = CoreScheduledTask<PikkuFunctionConfig<void, void, 'session' | 'rpc'>, PikkuMiddleware, Session>
`
  }${
    addon
      ? ''
      : `
/**
 * Registers a scheduled task with the Pikku framework.
 * Tasks run based on cron expressions. Declare \`session\` to give one a system identity.
 *
 * @param task - Scheduled task definition with cron expression and handler
 *
 * @example snippet: wireScheduler
 */
export const wireScheduler = (task: SchedulerWiring) => {
  wireSchedulerCore(task as any)
}
`
  }`
}
