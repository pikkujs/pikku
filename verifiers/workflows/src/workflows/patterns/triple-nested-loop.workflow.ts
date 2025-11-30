/**
 * Triple nested loop workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const tripleNestedLoopWorkflow = pikkuWorkflowFunc<
  {
    organizations: Array<{
      orgId: string
      projects: Array<{
        projectId: string
        taskIds: string[]
      }>
    }>
  },
  { totalProcessed: number }
>(async (_services, data, { workflow }) => {
  let totalProcessed = 0

  // Level 1: Organizations
  for (const org of data.organizations) {
    await workflow.do(`Process org ${org.orgId}`, 'projectGet', {
      projectId: org.orgId,
    })

    // Level 2: Projects
    for (const project of org.projects) {
      await workflow.do(`Process project ${project.projectId}`, 'projectGet', {
        projectId: project.projectId,
      })

      // Level 3: Tasks
      for (const taskId of project.taskIds) {
        await workflow.do(`Process task ${taskId}`, 'taskGet', {
          taskId,
        })
        totalProcessed++
      }
    }
  }

  return { totalProcessed }
})
