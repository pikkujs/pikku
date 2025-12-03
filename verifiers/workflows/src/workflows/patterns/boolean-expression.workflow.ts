/**
 * Boolean expression conditional workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const booleanExpressionWorkflow = pikkuWorkflowFunc<
  {
    isUrgent: boolean
    isHighValue: boolean
    requiresApproval: boolean
    customerTier: number
  },
  { processType: string; notificationsSent: number }
>({
  title: 'Boolean Expression',
  tags: ['patterns'],
  func: async (_services, data, { workflow }) => {
    let processType = 'standard'
    let notificationsSent = 0

    // Complex boolean expressions
    if (data.isUrgent && data.isHighValue) {
      processType = 'priority-express'

      // Notify multiple channels
      await Promise.all([
        workflow.do('Urgent notification', 'notifySlack', {
          channel: '#urgent',
          message: 'Urgent high-value request received',
        }),
        workflow.do('SMS alert', 'notifySMS', {
          userId: 'on-call',
          message: 'Urgent high-value request needs attention',
        }),
      ])
      notificationsSent = 2
    } else if (data.isUrgent || (data.isHighValue && data.customerTier >= 3)) {
      processType = 'priority'

      await workflow.do('Priority notification', 'notifyEmail', {
        userId: 'priority-handler',
        subject: 'Priority Request',
        body: 'A priority request has been received.',
      })
      notificationsSent = 1
    } else if (data.requiresApproval && data.customerTier < 2) {
      processType = 'approval-required'

      await workflow.do('Request approval', 'notifyEmail', {
        userId: 'approver',
        subject: 'Approval Required',
        body: 'A request needs your approval.',
      })
      notificationsSent = 1
    }

    // Additional condition check
    if (
      !data.isUrgent &&
      data.customerTier >= 4 &&
      processType === 'standard'
    ) {
      processType = 'vip-standard'
    }

    return { processType, notificationsSent }
  },
})
