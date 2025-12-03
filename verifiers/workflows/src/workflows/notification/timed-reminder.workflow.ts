/**
 * Timed reminder workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const timedReminderWorkflow = pikkuWorkflowFunc<
  {
    userId: string
    reminderTitle: string
    reminderMessage: string
    intervals: string[]
  },
  { remindersSent: number }
>(async (_services, data, { workflow }) => {
  let remindersSent = 0

  for (const interval of data.intervals) {
    // Wait for the interval
    await workflow.sleep(`Wait ${interval}`, interval)

    // Send reminder
    await workflow.do(`Send reminder ${remindersSent + 1}`, 'notifyEmail', {
      userId: data.userId,
      subject: `Reminder: ${data.reminderTitle}`,
      body: `${data.reminderMessage}\n\n(Reminder ${remindersSent + 1} of ${data.intervals.length})`,
    })

    remindersSent++
  }

  return { remindersSent }
})
