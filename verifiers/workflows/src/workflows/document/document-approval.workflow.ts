/**
 * Document Approval Workflow
 * Demonstrates document creation with approval process
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Document approval workflow: create, request review, approve/reject
 */
export const documentApprovalWorkflow = pikkuWorkflowFunc<
  {
    title: string
    content: string
    authorId: string
    reviewerIds: string[]
  },
  {
    documentId: string
    status: string
    approvedBy?: string
    rejectedBy?: string
  }
>({
  title: 'Document Approval',
  tags: ['document'],
  func: async (_services, data, { workflow }) => {
    // Step 1: Create document
    const doc = await workflow.do('Create document', 'documentCreate', {
      title: data.title,
      content: data.content,
      authorId: data.authorId,
      type: 'contract',
    })

    // Step 2: Request review
    await workflow.do('Request review', 'documentRequestReview', {
      documentId: doc.id,
      reviewerIds: data.reviewerIds,
    })

    // Step 3: Notify reviewers in parallel
    await Promise.all(
      data.reviewerIds.map(
        async (reviewerId) =>
          await workflow.do(`Notify reviewer ${reviewerId}`, 'notifyEmail', {
            userId: reviewerId,
            subject: `Review Requested: ${data.title}`,
            body: `Document "${data.title}" needs your review.`,
          })
      )
    )

    // Step 4: Wait for review processing
    await workflow.sleep('Wait for review', '2s')

    // Step 5: Approve document (mock - in reality would check review status)
    const approverId = data.reviewerIds[0]!
    const approval = await workflow.do('Approve document', 'documentApprove', {
      documentId: doc.id,
      approverId,
      comments: 'Looks good!',
    })

    // Step 6: Notify author
    await workflow.do('Notify author of approval', 'notifyEmail', {
      userId: data.authorId,
      subject: `Document Approved: ${data.title}`,
      body: `Your document has been approved by ${data.reviewerIds[0]}.`,
    })

    return {
      documentId: doc.id,
      status: approval.status,
      approvedBy: data.reviewerIds[0],
    }
  },
})
