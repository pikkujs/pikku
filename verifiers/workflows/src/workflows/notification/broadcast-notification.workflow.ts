/**
 * Broadcast notification workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const broadcastNotificationWorkflow = pikkuWorkflowFunc<
  { userIds: string[]; title: string; message: string; channel: string },
  { deliveredCount: number }
>({
  title: 'Broadcast Notification',
  tags: ['notification'],
  func: async (_services, data, { workflow }) => {
    // Use batch notification for efficiency
    await workflow.do('Send batch notification', 'notifyBatch', {
      userIds: data.userIds,
      channel: data.channel,
      title: data.title,
      body: data.message,
    })

    // Also log to Slack
    await workflow.do('Log broadcast to Slack', 'notifySlack', {
      channel: '#broadcasts',
      message: `Broadcast sent to ${data.userIds.length} users: ${data.title}`,
    })

    return {
      deliveredCount: data.userIds.length,
    }
  },
})
