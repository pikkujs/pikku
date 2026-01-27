/**
 * Document rollback workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const documentRollbackWorkflow = pikkuWorkflowFunc<
  { documentId: string; targetVersion: number; reason: string },
  { documentId: string; rolledBackTo: number; newVersion: number }
>({
  title: 'Document Rollback',
  tags: ['document'],
  func: async (_services, data, { workflow }) => {
    // Step 1: Get current document
    const doc = await workflow.do('Get document', 'documentGet', {
      documentId: data.documentId,
    })

    // Step 2: Get version history to find target version content
    await workflow.do('Get version history', 'documentVersionList', {
      documentId: data.documentId,
    })

    // Step 3: Update document to target version content (mock)
    await workflow.do('Update to target version', 'documentUpdate', {
      documentId: data.documentId,
      content: `Content from version ${data.targetVersion}`,
    })

    // Step 4: Create new version noting the rollback
    const newVersion = await workflow.do(
      'Create rollback version',
      'documentVersionCreate',
      {
        documentId: data.documentId,
        content: `Content from version ${data.targetVersion}`,
        changeNote: `Rolled back to version ${data.targetVersion}. Reason: ${data.reason}`,
      }
    )

    // Step 5: Notify about rollback
    await workflow.do('Notify rollback', 'notifySlack', {
      channel: '#documents',
      message: `Document "${doc.title}" rolled back to version ${data.targetVersion}. Reason: ${data.reason}`,
    })

    // Step 6: Notify author
    await workflow.do('Notify author', 'notifyEmail', {
      userId: doc.authorId,
      subject: `Document Rolled Back: ${doc.title}`,
      body: `Your document was rolled back to version ${data.targetVersion}. Reason: ${data.reason}`,
    })

    return {
      documentId: data.documentId,
      rolledBackTo: data.targetVersion,
      newVersion: newVersion.version,
    }
  },
})
