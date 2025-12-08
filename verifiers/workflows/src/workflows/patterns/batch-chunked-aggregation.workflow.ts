/**
 * Batch aggregation with chunking workflow
 *
 * Note: Uses pikkuWorkflowComplexFunc because Promise.all(chunk.map(...)) pattern
 * is not supported by DSL static analysis. DSL only supports direct workflow.do()
 * calls inside for-of loops, not nested parallel patterns.
 */

import { pikkuWorkflowComplexFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const batchChunkedAggregationWorkflow = {
  title: 'Batch Chunked Aggregation',
  tags: ['patterns'],
  func: pikkuWorkflowComplexFunc<
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
  }),
}
