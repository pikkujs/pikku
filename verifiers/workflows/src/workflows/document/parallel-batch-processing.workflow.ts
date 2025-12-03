/**
 * Parallel batch processing workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const parallelBatchProcessingWorkflow = pikkuWorkflowFunc<
  { documentIds: string[]; operation: string },
  { processedCount: number }
>({
  title: 'Parallel Batch Processing',
  tags: ['document'],
  func: async (_services, data, { workflow }) => {
    // Process all documents in parallel
    await Promise.all(
      data.documentIds.map(
        async (docId) =>
          await workflow.do(`Process ${docId}`, 'documentProcess', {
            documentId: docId,
            operation: data.operation,
          })
      )
    )

    return {
      processedCount: data.documentIds.length,
    }
  },
})
