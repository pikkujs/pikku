/**
 * Lambda handler for EventBridge scheduled events.
 *
 * Since each Lambda corresponds to a single unit, and each unit has
 * specific scheduled tasks registered, we run all tasks in this unit
 * when the schedule fires.
 */

import type { ScheduledEvent } from 'aws-lambda'
import { runScheduledTask, getScheduledTasks } from '@pikku/core/scheduler'

export const runLambdaScheduled = async (
  _event: ScheduledEvent
): Promise<void> => {
  const traceId = `cron-${crypto.randomUUID()}`
  const scheduledTasks = getScheduledTasks()

  // Run all scheduled tasks registered in this unit.
  // Typically one task per unit, but iterate all to be safe.
  for (const [name] of scheduledTasks) {
    await runScheduledTask({ name, traceId })
  }
}
