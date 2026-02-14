import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphDocumentRejectionWorkflow = pikkuWorkflowGraph({
  name: 'graphDocumentRejectionWorkflow',
  tags: ['document'],
  nodes: {
    get_document: 'documentGet',
    reject_document: 'documentReject',
    notify_author: 'notifyEmail',
    create_revision_task: 'taskCreate',
  },
  config: {
    get_document: {
      next: 'reject_document',
      input: (ref, template) => ({
        documentId: ref('trigger', 'documentId'),
      }),
    },
    reject_document: {
      next: 'notify_author',
      input: (ref, template) => ({
        documentId: ref('trigger', 'documentId'),
        reviewerId: ref('trigger', 'reviewerId'),
        reason: ref('trigger', 'reason'),
      }),
    },
    notify_author: {
      next: 'create_revision_task',
      input: (ref, template) => ({
        userId: ref('get_document', 'authorId'),
        subject: template('Document Rejected: $0', [
          ref('get_document', 'title'),
        ]),
        body: template('Your document was rejected. Reason: $0', [
          ref('trigger', 'reason'),
        ]),
      }),
    },
    create_revision_task: {
      input: (ref, template) => ({
        title: template('Revise document: $0', [ref('get_document', 'title')]),
        description: template('Rejection reason: $0', [
          ref('trigger', 'reason'),
        ]),
        assigneeId: ref('get_document', 'authorId'),
      }),
    },
  },
})
