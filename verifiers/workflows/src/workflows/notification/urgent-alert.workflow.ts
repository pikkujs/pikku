/**
 * Urgent alert workflow with parallel escalation
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const urgentAlertWorkflow = pikkuWorkflowFunc<
  { alertTitle: string; alertMessage: string; oncallUserIds: string[] },
  { notifiedCount: number }
>({
  title: 'Urgent Alert',
  tags: ['notification'],
  func: async (_services, data, { workflow }) => {
    // Notify all on-call users simultaneously
    await Promise.all(
      data.oncallUserIds.map(async (userId) => {
        // Send all channels in parallel for each user
        await Promise.all([
          workflow.do(`Email ${userId}`, 'notifyEmail', {
            userId,
            subject: `[URGENT] ${data.alertTitle}`,
            body: data.alertMessage,
          }),
          workflow.do(`SMS ${userId}`, 'notifySMS', {
            userId,
            message: `URGENT: ${data.alertTitle}`,
          }),
          workflow.do(`Push ${userId}`, 'notifyPush', {
            userId,
            title: `URGENT: ${data.alertTitle}`,
            body: data.alertMessage,
          }),
        ])
      })
    )

    // Notify ops channel
    await workflow.do('Notify ops', 'notifySlack', {
      channel: '#ops-alerts',
      message: `🚨 URGENT: ${data.alertTitle} - ${data.oncallUserIds.length} on-call notified`,
    })

    return {
      notifiedCount: data.oncallUserIds.length,
    }
  },
})
