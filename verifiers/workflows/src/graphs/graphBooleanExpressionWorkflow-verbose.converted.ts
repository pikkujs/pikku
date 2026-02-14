import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphBooleanExpressionWorkflow = pikkuWorkflowGraph({
  name: 'graphBooleanExpressionWorkflow',
  tags: ['patterns'],
  nodes: {
    urgent_notification: 'notifySlack',
    sms_alert: 'notifySMS',
    priority_notification: 'notifyEmail',
    request_approval: 'notifyEmail',
  },
  config: {
    urgent_notification: {
      next: 'sms_alert',
      input: () => ({
        channel: '#urgent',
        message: 'Urgent high-value request received',
      }),
    },
    sms_alert: {
      input: () => ({
        userId: 'on-call',
        message: 'Urgent high-value request needs attention',
      }),
    },
    priority_notification: {
      input: () => ({
        userId: 'priority-handler',
        subject: 'Priority Request',
        body: 'A priority request has been received.',
      }),
    },
    request_approval: {
      input: () => ({
        userId: 'approver',
        subject: 'Approval Required',
        body: 'A request needs your approval.',
      }),
    },
  },
})
