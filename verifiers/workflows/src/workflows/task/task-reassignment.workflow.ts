/**
 * Task Reassignment Workflow
 * Demonstrates reassigning a task to a new user with notifications
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Task reassignment workflow
 */
export const taskReassignmentWorkflow = pikkuWorkflowFunc<
  { taskId: string; newAssigneeId: string; addComment: boolean },
  { previousAssigneeId: string; newAssigneeId: string; commentAdded: boolean }
>(async (_services, data, { workflow }) => {
  // Step 1: Get current task details
  const task = await workflow.do('Get current task', 'taskGet', {
    taskId: data.taskId,
  })

  // Step 2: Get new assignee details
  const newAssignee = await workflow.do('Get new assignee', 'userGet', {
    userId: data.newAssigneeId,
  })

  // Step 3: Update task with new assignee
  await workflow.do('Reassign task', 'taskUpdate', {
    taskId: data.taskId,
    assigneeId: data.newAssigneeId,
  })

  // Step 4: Optionally add a comment about reassignment
  let commentAdded = false
  if (data.addComment) {
    await workflow.do('Add reassignment comment', 'taskCommentAdd', {
      taskId: data.taskId,
      content: `Task reassigned to ${newAssignee.name}`,
      authorId: 'system',
    })
    commentAdded = true
  }

  // Step 5: Notify both users in parallel
  await Promise.all([
    workflow.do('Notify previous assignee', 'notifyEmail', {
      userId: 'previous-assignee',
      subject: 'Task reassigned',
      body: `Task ${task.title} has been reassigned`,
    }),
    workflow.do('Notify new assignee', 'notifyEmail', {
      userId: data.newAssigneeId,
      subject: 'New task assigned',
      body: `Task ${task.title} has been assigned to you`,
    }),
  ])

  return {
    previousAssigneeId: 'previous-assignee',
    newAssigneeId: data.newAssigneeId,
    commentAdded,
  }
})
