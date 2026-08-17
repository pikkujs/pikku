/**
 * Generates type definitions for scheduler wirings
 */
export const serializeSchedulerTypes = (
  functionTypesImportPath: string,
  { addon = false }: { addon?: boolean } = {}
) => {
  return `/**
 * Scheduler-specific type definitions for tree-shaking optimization
 */

${addon ? '' : `import { wireScheduler as wireSchedulerCore } from '@pikku/core/scheduler'\n`}import { CoreScheduledTask } from '@pikku/core/scheduler'
import type { PikkuFunctionConfig, PikkuMiddleware } from '${functionTypesImportPath}'

/**
 * Type definition for scheduled tasks that run at specified intervals.
 * These are sessionless functions that execute based on cron expressions.
 */
type SchedulerWiring = CoreScheduledTask<PikkuFunctionConfig<void, void, 'session' | 'rpc'>, PikkuMiddleware>
${
  addon
    ? ''
    : `
/**
 * Registers a scheduled task with the Pikku framework.
 * Tasks run based on cron expressions and are sessionless.
 *
 * @param task - Scheduled task definition with cron expression and handler
 */
export const wireScheduler = (task: SchedulerWiring) => {
  wireSchedulerCore(task as any)
}
`
}`
}
