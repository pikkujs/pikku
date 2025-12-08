/**
 * Multi-Channel Notification Workflow
 * Demonstrates parallel notifications across channels
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const multiChannelNotifyWorkflow = pikkuWorkflowFunc<
  {
    userId: string
    title: string
    message: string
    channels: Array<'email' | 'sms' | 'push' | 'slack'>
  },
  { sentChannels: string[]; failedChannels: string[] }
>({
  title: 'Multi Channel Notify',
  tags: ['notification'],
  func: async (_services, data, { workflow }) => {
    const sentChannels: string[] = []
    const failedChannels: string[] = []

    // Send notifications in parallel
    await Promise.all(
      data.channels.map(async (channel) => {
        switch (channel) {
          case 'email':
            await workflow.do('Send email', 'notifyEmail', {
              userId: data.userId,
              subject: data.title,
              body: data.message,
            })
            sentChannels.push('email')
            break
          case 'sms':
            await workflow.do('Send SMS', 'notifySMS', {
              userId: data.userId,
              message: `${data.title}: ${data.message}`,
            })
            sentChannels.push('sms')
            break
          case 'push':
            await workflow.do('Send push', 'notifyPush', {
              userId: data.userId,
              title: data.title,
              body: data.message,
            })
            sentChannels.push('push')
            break
          case 'slack':
            await workflow.do('Send Slack', 'notifySlack', {
              channel: '#notifications',
              message: `${data.title}: ${data.message}`,
            })
            sentChannels.push('slack')
            break
          default:
            failedChannels.push(channel)
        }
      })
    )

    return { sentChannels, failedChannels }
  },
})
