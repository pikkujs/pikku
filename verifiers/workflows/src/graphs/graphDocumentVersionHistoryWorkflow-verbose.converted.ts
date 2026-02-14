import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphDocumentVersionHistoryWorkflow = pikkuWorkflowGraph({
  name: 'graphDocumentVersionHistoryWorkflow',
  tags: ['document'],
  nodes: {
    get_document: 'documentGet',
    get_version_history: 'documentVersionList',
    generate_version_report: 'documentGenerateReport',
  },
  config: {
    get_document: {
      next: 'get_version_history',
      input: (ref, template) => ({
        documentId: ref('trigger', 'documentId'),
      }),
    },
    get_version_history: {
      next: 'generate_version_report',
      input: (ref, template) => ({
        documentId: ref('trigger', 'documentId'),
      }),
    },
    generate_version_report: {
      input: (ref, template) => ({
        documentIds: [ref('trigger', 'documentId')],
        reportType: 'version_history',
      }),
    },
  },
})
