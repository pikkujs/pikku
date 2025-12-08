/**
 * Project Cleanup and Archive Workflow
 * Demonstrates cleaning up pending tasks before archiving
 */

import { pikkuWorkflowComplexFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Project cleanup before archive workflow
 *
 * Uses pikkuWorkflowComplexFunc because:
 * - Filter callback to find pending tasks based on runtime status
 * - Dynamic for-of loop over filtered results
 * - Loop iteration count depends on runtime data
 */
export const projectCleanupAndArchiveWorkflow = pikkuWorkflowComplexFunc<
  { projectId: string; completePendingTasks: boolean },
  { archivedAt: string; tasksCompleted: number }
>({
  title: 'Project Cleanup And Archive',
  tags: ['project'],
  func: async (_services, data, { workflow }) => {
    // Step 1: Get project tasks
    const tasks = await workflow.do('Get project tasks', 'projectTaskList', {
      projectId: data.projectId,
    })

    // Step 2: Complete pending tasks if requested
    let tasksCompleted = 0
    if (data.completePendingTasks) {
      const pendingTasks = tasks.tasks.filter((t) => t.status === 'pending')
      for (const task of pendingTasks) {
        await workflow.do(`Complete task ${task.id}`, 'taskUpdate', {
          taskId: task.id,
          status: 'completed',
        })
        tasksCompleted++
      }
    }

    // Step 3: Archive the project
    const archived = await workflow.do('Archive project', 'projectArchive', {
      projectId: data.projectId,
    })

    return {
      archivedAt: archived.archivedAt,
      tasksCompleted,
    }
  },
})
