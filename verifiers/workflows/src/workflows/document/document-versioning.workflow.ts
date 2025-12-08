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
>({
  title: 'Document Versioning',
  tags: ['document'],
  func: async (_services, data, { workflow }) => {
    let watchersNotified = 0

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
    const version = await workflow.do(
      'Create version',
      'documentVersionCreate',
      {
        documentId: data.documentId,
        content: data.newContent,
        changeNote: data.changeNote,
      }
    )

    // Step 4: Notify watchers if requested
    if (data.notifyWatchers) {
      await Promise.all([
        workflow.do('Notify watcher 1', 'notifyEmail', {
          userId: 'watcher-1',
          subject: `Document Updated: ${doc.title}`,
          body: `Version ${version.version} created. Change: ${data.changeNote}`,
        }),
        workflow.do('Notify watcher 2', 'notifyEmail', {
          userId: 'watcher-2',
          subject: `Document Updated: ${doc.title}`,
          body: `Version ${version.version} created. Change: ${data.changeNote}`,
        }),
        workflow.do('Notify watcher 3', 'notifyEmail', {
          userId: 'watcher-3',
          subject: `Document Updated: ${doc.title}`,
          body: `Version ${version.version} created. Change: ${data.changeNote}`,
        }),
      ])
      watchersNotified = 3
    }

    return {
      documentId: data.documentId,
      newVersion: version.version,
      watchersNotified,
    }
  },
})
