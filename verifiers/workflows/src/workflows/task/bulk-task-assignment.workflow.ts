/**
 * Bulk Task Assignment Workflow
 * Demonstrates parallel task creation and assignment
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Bulk task assignment workflow
 */
export const bulkTaskAssignmentWorkflow = pikkuWorkflowFunc<
  { tasks: Array<{ title: string; assigneeId: string }> },
  { assignedTasks: Array<{ taskId: string; assigneeId: string }> }
>(async (_services, data, { workflow }) => {
  const assignedTasks: Array<{ taskId: string; assigneeId: string }> = []

  // Create and assign tasks in parallel
  await Promise.all(
    data.tasks.map(async (taskData, index) => {
      const task = await workflow.do(
        `Create and assign task ${index + 1}`,
        'taskCreate',
        {
          title: taskData.title,
          assigneeId: taskData.assigneeId,
        }
      )
      assignedTasks.push({
        taskId: task.id,
        assigneeId: taskData.assigneeId,
      })
    })
  )

  return { assignedTasks }
})
