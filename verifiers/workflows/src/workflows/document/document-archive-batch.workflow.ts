/**
 * Document archive batch workflow
 */

import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const documentArchiveBatchWorkflow = pikkuWorkflowFunc<
  { authorId: string; status: string; olderThanDays: number },
  { archivedCount: number; reportGenerated: boolean }
>({
  title: 'Document Archive Batch',
  tags: ['document'],
  func: async (_services, data, { workflow }) => {
    // Step 1: List documents to archive
    const docs = await workflow.do('List documents', 'documentList', {
      authorId: data.authorId,
      status: data.status,
      limit: 100,
    })

    // Step 2: Process each document for archival
    let archivedCount = 0
    for (const doc of docs.documents) {
      await workflow.do(`Archive ${doc.id}`, 'documentProcess', {
        documentId: doc.id,
        operation: 'archive',
      })
      archivedCount++
    }

    // Step 3: Generate archive report
    await workflow.do('Generate archive report', 'documentGenerateReport', {
      documentIds: docs.documents.map((d) => d.id),
      reportType: 'archive_summary',
    })

    // Step 4: Notify
    await workflow.do('Notify archival complete', 'emailSend', {
      to: 'admin@example.com',
      subject: 'Document Archive Complete',
      body: `Archived ${archivedCount} documents.`,
    })

    return {
      archivedCount,
      reportGenerated: true,
    }
  },
})
