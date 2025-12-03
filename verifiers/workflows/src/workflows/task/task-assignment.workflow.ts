/**
 * Task Assignment Workflow
 * Demonstrates task creation with user lookup and assignment
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Task assignment workflow: create task, get user, assign
 */
export const taskAssignmentWorkflow = pikkuWorkflowFunc<
  { title: string; assigneeId: string; notifyAssignee: boolean },
  { taskId: string; assigneeName: string; notified: boolean }
>(async (_services, data, { workflow }) => {
  // Step 1: Get the assignee user details
  const assignee = await workflow.do('Get assignee details', 'userGet', {
    userId: data.assigneeId,
  })

  // Step 2: Create the task with assignee
  const task = await workflow.do('Create task', 'taskCreate', {
    title: data.title,
    assigneeId: data.assigneeId,
  })

  // Step 3: Conditionally notify the assignee
  let notified = false
  if (data.notifyAssignee) {
    await workflow.do('Notify assignee', 'notifyEmail', {
      userId: data.assigneeId,
      subject: `New task assigned: ${data.title}`,
      body: `You have been assigned a new task: ${task.title}`,
    })
    notified = true
  }

  return {
    taskId: task.id,
    assigneeName: assignee.name,
    notified,
  }
})
