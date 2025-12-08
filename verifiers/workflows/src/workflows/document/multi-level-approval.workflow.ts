/**
 * Multi-level approval workflow
 */

import { pikkuWorkflowComplexFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const multiLevelApprovalWorkflow = pikkuWorkflowComplexFunc<
  {
    documentId: string
    approvalLevels: Array<{ level: number; approverId: string }>
  },
  { documentId: string; approvedLevels: number[]; finalStatus: string }
>({
  title: 'Multi Level Approval',
  tags: ['document'],
  func: async (_services, data, { workflow }) => {
    const approvedLevels: number[] = []

    for (const level of data.approvalLevels) {
      // Request approval at this level
      await workflow.do(
        `Request level ${level.level} approval`,
        'notifyEmail',
        {
          userId: level.approverId,
          subject: `Approval Required - Level ${level.level}`,
          body: `Document requires your level ${level.level} approval.`,
        }
      )

      // Wait for processing
      await workflow.sleep(`Wait for level ${level.level}`, '1s')

      // Process approval
      await workflow.do(`Level ${level.level} approval`, 'documentApprove', {
        documentId: data.documentId,
        approverId: level.approverId,
        comments: `Approved at level ${level.level}`,
      })

      approvedLevels.push(level.level)
    }

    // Final notification
    await workflow.do('Notify final approval', 'notifySlack', {
      channel: '#approvals',
      message: `Document ${data.documentId} fully approved through ${approvedLevels.length} levels`,
    })

    return {
      documentId: data.documentId,
      approvedLevels,
      finalStatus: 'approved',
    }
  },
})
