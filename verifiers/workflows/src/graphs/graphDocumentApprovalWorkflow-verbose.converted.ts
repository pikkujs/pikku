import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphDocumentApprovalWorkflow = pikkuWorkflowGraph({
  name: 'graphDocumentApprovalWorkflow',
  tags: ['document'],
  nodes: {
    create_document: 'documentCreate',
    request_review: 'documentRequestReview',
    notify_reviewer_reviewerid: 'notifyEmail',
    approve_document: 'documentApprove',
    notify_author_of_approval: 'notifyEmail',
  },
  config: {
    create_document: {
      next: 'request_review',
      input: (ref, template) => ({
        title: ref('trigger', 'title'),
        content: ref('trigger', 'content'),
        authorId: ref('trigger', 'authorId'),
        type: 'contract',
      }),
    },
    request_review: {
      next: 'notify_reviewer_reviewerid',
      input: (ref, template) => ({
        documentId: ref('create_document', 'id'),
        reviewerIds: ref('trigger', 'reviewerIds'),
      }),
    },
    notify_reviewer_reviewerid: {
      input: (ref, template) => ({
        userId: ref('$item', 'reviewerId'),
        subject: template('Review Requested: $0', [ref('trigger', 'title')]),
        body: template('Document "$0" needs your review.', [
          ref('trigger', 'title'),
        ]),
      }),
    },
    approve_document: {
      next: 'notify_author_of_approval',
      input: (ref, template) => ({
        documentId: ref('create_document', 'id'),
        approverId: ref('trigger', 'approverId'),
        comments: 'Looks good!',
      }),
    },
    notify_author_of_approval: {
      input: (ref, template) => ({
        userId: ref('trigger', 'authorId'),
        subject: template('Document Approved: $0', [ref('trigger', 'title')]),
        body: template('Your document has been approved by $0.', [
          { $ref: 'data.reviewerIds[0]' } as any,
        ]),
      }),
    },
  },
})
