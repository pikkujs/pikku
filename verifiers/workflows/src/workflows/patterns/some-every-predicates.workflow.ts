/**
 * Some and every predicates workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const someEveryPredicatesWorkflow = pikkuWorkflowFunc<
  { userIds: string[]; requiredRole: string },
  { hasAdmin: boolean; allVerified: boolean; canProceed: boolean }
>({
  title: 'Some Every Predicates',
  tags: ['patterns'],
  func: async (_services, data, { workflow }) => {
    // Get all users
    const users: Array<{ id: string; role: string; status: string }> = []
    for (const userId of data.userIds) {
      const user = await workflow.do(`Get user ${userId}`, 'userGet', {
        userId,
      })
      users.push({
        id: user.id,
        role: user.role,
        status: user.status,
      })
    }

    // Check if some user has admin role
    const hasAdmin = users.some((user) => user.role === 'admin')

    // Check if all users are verified
    const allVerified = users.every((user) => user.status === 'active')

    // Determine if we can proceed
    const canProceed = hasAdmin && allVerified

    if (canProceed) {
      await workflow.do('Notify approval', 'notifySlack', {
        channel: '#approvals',
        message: 'All conditions met - proceeding with operation',
      })
    } else {
      await workflow.do('Notify blocked', 'notifySlack', {
        channel: '#approvals',
        message: `Operation blocked - hasAdmin: ${hasAdmin}, allVerified: ${allVerified}`,
      })
    }

    return { hasAdmin, allVerified, canProceed }
  },
})
