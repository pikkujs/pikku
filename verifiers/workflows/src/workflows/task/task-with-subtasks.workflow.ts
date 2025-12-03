/**
 * Task Subtasks Workflow
 * Demonstrates parent task with subtask management
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Task with subtasks workflow: create parent, add subtasks, list
 */
export const taskWithSubtasksWorkflow = pikkuWorkflowFunc<
  { parentTitle: string; subtaskTitles: string[] },
  { parentTaskId: string; subtaskIds: string[]; totalSubtasks: number }
>(async (_services, data, { workflow }) => {
  // Step 1: Create the parent task
  const parentTask = await workflow.do('Create parent task', 'taskCreate', {
    title: data.parentTitle,
  })

  // Step 2: Create subtasks sequentially
  const subtaskIds: string[] = []
  for (const title of data.subtaskTitles) {
    const subtask = await workflow.do(
      `Create subtask: ${title}`,
      'subtaskCreate',
      {
        parentTaskId: parentTask.id,
        title,
      }
    )
    subtaskIds.push(subtask.id)
  }

  // Step 3: List all subtasks
  const subtaskList = await workflow.do('List subtasks', 'subtaskList', {
    parentTaskId: parentTask.id,
  })

  return {
    parentTaskId: parentTask.id,
    subtaskIds,
    totalSubtasks: subtaskList.subtasks.length,
  }
})
