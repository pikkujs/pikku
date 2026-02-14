import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphUrgentAlertWorkflow = pikkuWorkflowGraph({
  name: 'graphUrgentAlertWorkflow',
  tags: ['notification'],
  nodes: {
    notify_ops: 'notifySlack',
  },
  config: {
    notify_ops: {
      input: (ref, template) => ({
        channel: '#ops-alerts',
        message: template('🚨 URGENT: $0 - $1 on-call notified', [
          ref('trigger', 'alertTitle'),
          { $ref: 'data.oncallUserIds.length' } as any,
        ]),
      }),
    },
  },
})
