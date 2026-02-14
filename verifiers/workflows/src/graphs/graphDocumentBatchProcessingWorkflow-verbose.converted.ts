import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphDocumentBatchProcessingWorkflow = pikkuWorkflowGraph({
  name: 'graphDocumentBatchProcessingWorkflow',
  tags: ['document'],
  nodes: {
    process_docid: 'documentProcess',
    generate_report: 'documentGenerateReport',
    notify_completion: 'notifySlack',
  },
  config: {
    process_docid: {
      input: (ref, template) => ({
        documentId: ref('$item', 'docId'),
        operation: ref('trigger', 'operation'),
      }),
    },
    generate_report: {
      next: 'notify_completion',
      input: (ref, template) => ({
        documentIds: ref('trigger', 'documentIds'),
        reportType: 'batch_processing',
      }),
    },
    notify_completion: {
      input: (ref, template) => ({
        channel: '#documents',
        message: template(
          'Batch processing complete: $0 processed, $1 failed',
          [ref('trigger', 'processedCount'), ref('trigger', 'failedCount')]
        ),
      }),
    },
  },
})
