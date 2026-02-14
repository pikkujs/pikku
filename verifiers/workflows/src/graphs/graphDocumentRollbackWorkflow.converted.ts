import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphDocumentRollbackWorkflow = pikkuWorkflowGraph({
  name: 'graphDocumentRollbackWorkflow',
  nodes: {
    get_document: 'documentGet',
    get_version_history: 'documentVersionList',
    update_to_target_version: 'documentUpdate',
    create_rollback_version: 'documentVersionCreate',
    notify_rollback: 'notifySlack',
    notify_author: 'notifyEmail',
  },
  config: {
    get_document: {
      next: 'get_version_history',
      input: (ref, template) => ({
        documentId: ref('trigger', 'documentId'),
      }),
    },
    get_version_history: {
      next: 'update_to_target_version',
      input: (ref, template) => ({
        documentId: ref('trigger', 'documentId'),
      }),
    },
    update_to_target_version: {
      next: 'create_rollback_version',
      input: (ref, template) => ({
        documentId: ref('trigger', 'documentId'),
        content: template('Content from version $0', [
          ref('trigger', 'targetVersion'),
        ]),
      }),
    },
    create_rollback_version: {
      next: 'notify_rollback',
      input: (ref, template) => ({
        documentId: ref('trigger', 'documentId'),
        content: template('Content from version $0', [
          ref('trigger', 'targetVersion'),
        ]),
        changeNote: template('Rolled back to version $0. Reason: $1', [
          ref('trigger', 'targetVersion'),
          ref('trigger', 'reason'),
        ]),
      }),
    },
    notify_rollback: {
      next: 'notify_author',
      input: (ref, template) => ({
        channel: '#documents',
        message: template(
          'Document "$0" rolled back to version $1. Reason: $2',
          [
            ref('get_document', 'title'),
            ref('trigger', 'targetVersion'),
            ref('trigger', 'reason'),
          ]
        ),
      }),
    },
    notify_author: {
      input: (ref, template) => ({
        userId: ref('get_document', 'authorId'),
        subject: template('Document Rolled Back: $0', [
          ref('get_document', 'title'),
        ]),
        body: template(
          'Your document was rolled back to version $0. Reason: $1',
          [ref('trigger', 'targetVersion'), ref('trigger', 'reason')]
        ),
      }),
    },
  },
})
