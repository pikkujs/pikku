/**
 * Document rejection workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const documentRejectionWorkflow = pikkuWorkflowFunc<
  { documentId: string; reviewerId: string; reason: string },
  { documentId: string; status: string; authorNotified: boolean }
>({
  title: 'Document Rejection',
  tags: ['document'],
  func: async (_services, data, { workflow }) => {
    // Step 1: Get document details
    const doc = await workflow.do('Get document', 'documentGet', {
      documentId: data.documentId,
    })

    // Step 2: Reject document
    await workflow.do('Reject document', 'documentReject', {
      documentId: data.documentId,
      reviewerId: data.reviewerId,
      reason: data.reason,
    })

    // Step 3: Notify author
    await workflow.do('Notify author', 'notifyEmail', {
      userId: doc.authorId,
      subject: `Document Rejected: ${doc.title}`,
      body: `Your document was rejected. Reason: ${data.reason}`,
    })

    // Step 4: Create task for revision
    await workflow.do('Create revision task', 'taskCreate', {
      title: `Revise document: ${doc.title}`,
      description: `Rejection reason: ${data.reason}`,
      assigneeId: doc.authorId,
    })

    return {
      documentId: data.documentId,
      status: 'rejected',
      authorNotified: true,
    }
  },
})
