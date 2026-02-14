import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphParallelBatchProcessingWorkflow = pikkuWorkflowGraph({
  name: 'graphParallelBatchProcessingWorkflow',
  tags: ['document'],
  nodes: {
    process_docid: 'documentProcess',
  },
  config: {
    process_docid: {
      input: (ref, template) => ({
        documentId: ref('$item', 'docId'),
        operation: ref('trigger', 'operation'),
      }),
    },
  },
})
