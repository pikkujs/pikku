/**
 * Document Versioning Workflow
 * Demonstrates document updates with version management
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Document versioning workflow: update, create version, notify
 */
export const documentVersioningWorkflow = pikkuWorkflowFunc<
  {
    documentId: string
    newContent: string
    changeNote: string
    notifyWatchers: boolean
  },
  { documentId: string; newVersion: number; watchersNotified: number }
>(async (_services, data, { workflow }) => {
  // Step 1: Get current document
  const doc = await workflow.do('Get document', 'documentGet', {
    documentId: data.documentId,
  })

  // Step 2: Update document content
  await workflow.do('Update document', 'documentUpdate', {
    documentId: data.documentId,
    content: data.newContent,
  })

  // Step 3: Create new version
  const version = await workflow.do('Create version', 'documentVersionCreate', {
    documentId: data.documentId,
    content: data.newContent,
    changeNote: data.changeNote,
  })

  // Step 4: Notify watchers if requested
  let watchersNotified = 0
  if (data.notifyWatchers) {
    // Mock: notify 3 watchers
    const watchers = ['watcher-1', 'watcher-2', 'watcher-3']
    await Promise.all(
      watchers.map(async (watcherId) => {
        await workflow.do(`Notify watcher ${watcherId}`, 'notifyEmail', {
          userId: watcherId,
          subject: `Document Updated: ${doc.title}`,
          body: `Version ${version.version} created. Change: ${data.changeNote}`,
        })
        watchersNotified++
      })
    )
  }

  return {
    documentId: data.documentId,
    newVersion: version.version,
    watchersNotified,
  }
})
