/**
 * Bulk Project Archive Workflow
 * Demonstrates archiving multiple projects sequentially
 */

import { pikkuWorkflowComplexFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Bulk project archive workflow
 */
export const bulkProjectArchiveWorkflow = pikkuWorkflowComplexFunc<
  { projectIds: string[] },
  { archivedProjects: Array<{ projectId: string; archivedAt: string }> }
>(async (_services, data, { workflow }) => {
  const archivedProjects: Array<{ projectId: string; archivedAt: string }> = []

  // Archive projects sequentially to avoid overwhelming the system
  for (const projectId of data.projectIds) {
    // Get project to verify it exists
    await workflow.do(`Verify project ${projectId}`, 'projectGet', {
      projectId,
    })

    // Archive
    const archived = await workflow.do(
      `Archive project ${projectId}`,
      'projectArchive',
      {
        projectId,
      }
    )

    archivedProjects.push({
      projectId,
      archivedAt: archived.archivedAt,
    })

    // Small delay between archives
    await workflow.sleep(`Delay after archiving ${projectId}`, '100ms')
  }

  return { archivedProjects }
})
