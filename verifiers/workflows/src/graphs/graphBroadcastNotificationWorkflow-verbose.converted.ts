import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphBroadcastNotificationWorkflow = pikkuWorkflowGraph({
  name: 'graphBroadcastNotificationWorkflow',
  tags: ['notification'],
  nodes: {
    send_batch_notification: 'notifyBatch',
    log_broadcast_to_slack: 'notifySlack',
  },
  config: {
    send_batch_notification: {
      next: 'log_broadcast_to_slack',
      input: (ref, template) => ({
        userIds: ref('trigger', 'userIds'),
        channel: ref('trigger', 'channel'),
        title: ref('trigger', 'title'),
        body: ref('trigger', 'message'),
      }),
    },
    log_broadcast_to_slack: {
      input: (ref, template) => ({
        channel: '#broadcasts',
        message: template('Broadcast sent to $0 users: $1', [
          { $ref: 'data.userIds.length' } as any,
          ref('trigger', 'title'),
        ]),
      }),
    },
  },
})
