/**
 * Task CRUD Workflow
 * Demonstrates basic create, read, update, delete operations
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Task lifecycle workflow: create, get, update, delete
 */
export const taskCrudWorkflow = pikkuWorkflowFunc<
  { title: string; description?: string },
  { taskId: string; finalStatus: string; deleted: boolean }
>(async (_services, data, { workflow }) => {
  // Step 1: Create the task
  const task = await workflow.do('Create task', 'taskCreate', {
    title: data.title,
    description: data.description,
  })

  // Step 2: Get the task to verify creation
  const _fetchedTask = await workflow.do('Get task', 'taskGet', {
    taskId: task.id,
  })

  // Step 3: Update the task status
  const _updatedTask = await workflow.do('Update task status', 'taskUpdate', {
    taskId: task.id,
    status: 'in_progress',
  })

  // Step 4: Update again to completed
  const completedTask = await workflow.do('Mark task completed', 'taskUpdate', {
    taskId: task.id,
    status: 'completed',
  })

  // Step 5: Delete the task
  const deleteResult = await workflow.do('Delete task', 'taskDelete', {
    taskId: task.id,
  })

  return {
    taskId: task.id,
    finalStatus: completedTask.status,
    deleted: deleteResult.deleted,
  }
})
