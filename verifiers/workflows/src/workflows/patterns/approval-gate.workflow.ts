/**
 * A gate whose outcome is bound and branched on
 */

import { z } from 'zod'
import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

const TaskDecision = z.object({ approve: z.boolean() })

export const approvalGateWorkflow = pikkuWorkflowFunc<
  { title: string },
  { outcome: 'started' | 'declined' | 'expired' }
>({
  title: 'Approval Gate',
  tags: ['patterns'],
  func: async (_services, data, { workflow }) => {
    const decision = await workflow.approval('Manager sign-off', {
      schema: TaskDecision,
      approvers: 'not-initiator',
      expiry: '3d',
    })

    if (decision.status === 'expired') {
      return { outcome: 'expired' }
    }

    if (!decision.data.approve) {
      return { outcome: 'declined' }
    }

    await workflow.do('Create task', 'taskCreate', { title: data.title })

    return { outcome: 'started' }
  },
})
