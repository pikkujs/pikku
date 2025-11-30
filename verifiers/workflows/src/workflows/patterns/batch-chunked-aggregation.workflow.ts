/**
 * Batch aggregation with chunking workflow
 * Note: Chunks must be pre-computed and passed as input since DSL doesn't support index-based loops
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const batchChunkedAggregationWorkflow = pikkuWorkflowFunc<
  { documentChunks: string[][] },
  { totalProcessed: number; chunks: number }
>(async (_services, data, { workflow }) => {
  let totalProcessed = 0
  let chunkIndex = 0

  // Process each pre-computed chunk
  for (const chunk of data.documentChunks) {
    chunkIndex++

    // Process chunk in parallel
    await Promise.all(
      chunk.map(
        async (docId) =>
          await workflow.do(`Process doc ${docId}`, 'documentProcess', {
            documentId: docId,
            operation: 'validate',
          })
      )
    )

    totalProcessed += chunk.length

    // Brief pause between chunks
    await workflow.sleep(`Pause after chunk ${chunkIndex}`, '100ms')
  }

  return { totalProcessed, chunks: chunkIndex }
})
