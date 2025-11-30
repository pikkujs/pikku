/**
 * Task List Workflow
 * Demonstrates task creation with filtering and listing
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Task list workflow with filtering
 */
export const taskListWorkflow = pikkuWorkflowFunc<
  { projectId: string; taskTitles: string[] },
  { createdTasks: string[]; listedCount: number }
>(async (_services, data, { workflow }) => {
  const createdTasks: string[] = []

  // Create multiple tasks sequentially using for...of
  for (const title of data.taskTitles) {
    const task = await workflow.do(`Create task: ${title}`, 'taskCreate', {
      title,
      projectId: data.projectId,
    })
    createdTasks.push(task.id)
  }

  // List all tasks for the project
  const listResult = await workflow.do('List project tasks', 'taskList', {
    projectId: data.projectId,
  })

  return {
    createdTasks,
    listedCount: listResult.tasks.length,
  }
})
