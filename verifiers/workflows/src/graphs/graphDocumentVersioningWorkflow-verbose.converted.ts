import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphDocumentVersioningWorkflow = pikkuWorkflowGraph({
  name: 'graphDocumentVersioningWorkflow',
  tags: ['document'],
  nodes: {
    get_document: 'documentGet',
    update_document: 'documentUpdate',
    create_version: 'documentVersionCreate',
    notify_watcher_1: 'notifyEmail',
    notify_watcher_2: 'notifyEmail',
    notify_watcher_3: 'notifyEmail',
  },
  config: {
    get_document: {
      next: 'update_document',
      input: (ref, template) => ({
        documentId: ref('trigger', 'documentId'),
      }),
    },
    update_document: {
      next: 'create_version',
      input: (ref, template) => ({
        documentId: ref('trigger', 'documentId'),
        content: ref('trigger', 'newContent'),
      }),
    },
    create_version: {
      input: (ref, template) => ({
        documentId: ref('trigger', 'documentId'),
        content: ref('trigger', 'newContent'),
        changeNote: ref('trigger', 'changeNote'),
      }),
    },
    notify_watcher_1: {
      next: 'notify_watcher_2',
      input: (ref, template) => ({
        userId: 'watcher-1',
        subject: template('Document Updated: $0', [
          ref('get_document', 'title'),
        ]),
        body: template('Version $0 created. Change: $1', [
          ref('create_version', 'version'),
          ref('trigger', 'changeNote'),
        ]),
      }),
    },
    notify_watcher_2: {
      next: 'notify_watcher_3',
      input: (ref, template) => ({
        userId: 'watcher-2',
        subject: template('Document Updated: $0', [
          ref('get_document', 'title'),
        ]),
        body: template('Version $0 created. Change: $1', [
          ref('create_version', 'version'),
          ref('trigger', 'changeNote'),
        ]),
      }),
    },
    notify_watcher_3: {
      input: (ref, template) => ({
        userId: 'watcher-3',
        subject: template('Document Updated: $0', [
          ref('get_document', 'title'),
        ]),
        body: template('Version $0 created. Change: $1', [
          ref('create_version', 'version'),
          ref('trigger', 'changeNote'),
        ]),
      }),
    },
  },
})
