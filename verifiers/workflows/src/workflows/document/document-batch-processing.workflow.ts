/**
 * Document Batch Processing Workflow
 * Demonstrates processing multiple documents
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Batch document processing workflow: get many, process each, generate report
 */
export const documentBatchProcessingWorkflow = pikkuWorkflowFunc<
  { documentIds: string[]; operation: string },
  { processedCount: number; failedCount: number; reportId: string }
>(async (_services, data, { workflow }) => {
  let processedCount = 0
  let failedCount = 0

  // Process documents sequentially
  for (const docId of data.documentIds) {
    const result = await workflow.do(`Process ${docId}`, 'documentProcess', {
      documentId: docId,
      operation: data.operation,
    })

    if (result.success) {
      processedCount++
    } else {
      failedCount++
    }

    // Rate limiting
    await workflow.sleep(`Rate limit after ${docId}`, '50ms')
  }

  // Generate summary report
  const report = await workflow.do(
    'Generate report',
    'documentGenerateReport',
    {
      documentIds: data.documentIds,
      reportType: 'batch_processing',
    }
  )

  // Notify completion
  await workflow.do('Notify completion', 'notifySlack', {
    channel: '#documents',
    message: `Batch processing complete: ${processedCount} processed, ${failedCount} failed`,
  })

  return {
    processedCount,
    failedCount,
    reportId: report.reportId,
  }
})
