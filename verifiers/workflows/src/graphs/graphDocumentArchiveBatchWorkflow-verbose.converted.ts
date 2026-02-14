import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphDocumentArchiveBatchWorkflow = pikkuWorkflowGraph({
  name: 'graphDocumentArchiveBatchWorkflow',
  tags: ['document'],
  nodes: {
    list_documents: 'documentList',
    archive_doc_id: 'documentProcess',
    generate_archive_report: 'documentGenerateReport',
    notify_archival_complete: 'emailSend',
  },
  config: {
    list_documents: {
      next: 'archive_doc_id',
      input: (ref, template) => ({
        authorId: ref('trigger', 'authorId'),
        status: ref('trigger', 'status'),
        limit: 100,
      }),
    },
    archive_doc_id: {
      input: () => ({
        operation: 'archive',
      }),
    },
    generate_archive_report: {
      next: 'notify_archival_complete',
      input: () => ({
        reportType: 'archive_summary',
      }),
    },
    notify_archival_complete: {
      input: (ref, template) => ({
        to: 'admin@example.com',
        subject: 'Document Archive Complete',
        body: template('Archived $0 documents.', [
          ref('trigger', 'archivedCount'),
        ]),
      }),
    },
  },
})
