/**
 * Version history workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const documentVersionHistoryWorkflow = pikkuWorkflowFunc<
  { documentId: string },
  { documentId: string; versionCount: number; latestVersion: number }
>(async (_services, data, { workflow }) => {
  // Step 1: Get document
  const _doc = await workflow.do('Get document', 'documentGet', {
    documentId: data.documentId,
  })

  // Step 2: Get version history
  const history = await workflow.do(
    'Get version history',
    'documentVersionList',
    {
      documentId: data.documentId,
    }
  )

  // Step 3: Generate version report
  await workflow.do('Generate version report', 'documentGenerateReport', {
    documentIds: [data.documentId],
    reportType: 'version_history',
  })

  return {
    documentId: data.documentId,
    versionCount: history.versions.length,
    latestVersion: history.versions[history.versions.length - 1]?.version || 1,
  }
})
