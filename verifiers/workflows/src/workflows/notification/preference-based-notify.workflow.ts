/**
 * Preference-based notification workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const preferenceBasedNotifyWorkflow = pikkuWorkflowFunc<
  { userId: string; title: string; message: string },
  { sentVia: string[] }
>({
  title: 'Preference Based Notify',
  tags: ['notification'],
  func: async (_services, data, { workflow }) => {
    // Step 1: Get user notification preferences
    const preferences = await workflow.do(
      'Get preferences',
      'notificationPreferencesGet',
      {
        userId: data.userId,
      }
    )

    const sentVia: string[] = []

    // Step 2: Send based on preferences
    if (preferences.email) {
      await workflow.do('Send email notification', 'notifyEmail', {
        userId: data.userId,
        subject: data.title,
        body: data.message,
      })
      sentVia.push('email')
    }

    if (preferences.sms) {
      await workflow.do('Send SMS notification', 'notifySMS', {
        userId: data.userId,
        message: data.message,
      })
      sentVia.push('sms')
    }

    if (preferences.push) {
      await workflow.do('Send push notification', 'notifyPush', {
        userId: data.userId,
        title: data.title,
        body: data.message,
      })
      sentVia.push('push')
    }

    if (preferences.slack) {
      await workflow.do('Send Slack notification', 'notifySlack', {
        channel: `#user-${data.userId}`,
        message: `${data.title}: ${data.message}`,
      })
      sentVia.push('slack')
    }

    return { sentVia }
  },
})
