/**
 * Nested loop with conditional break workflow
 */

import { pikkuWorkflowComplexFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const nestedLoopWithConditionWorkflow = {
  title: 'Nested Loop With Condition',
  tags: ['patterns'],
  func: pikkuWorkflowComplexFunc<
    { userIds: string[]; maxComments: number },
    { usersProcessed: number; totalComments: number }
  >(async (_services, data, { workflow }) => {
    let usersProcessed = 0
    let totalComments = 0

    // Outer loop: users
    for (const userId of data.userIds) {
      await workflow.do(`Get user ${userId}`, 'userGet', {
        userId,
      })

      // Get user's tasks
      const tasks = await workflow.do(`Get tasks for ${userId}`, 'taskList', {
        limit: 5,
      })

      // Inner loop: tasks
      for (const task of tasks.tasks) {
        // Innermost: get comments
        const comments = await workflow.do(
          `Get comments for ${task.id}`,
          'taskCommentList',
          {
            taskId: task.id,
          }
        )

        totalComments += comments.comments.length

        // Conditional check
        if (totalComments >= data.maxComments) {
          // Note: In DSL workflows, we can't break, but we can skip remaining iterations
          // This is a simplified version
          break
        }
      }

      usersProcessed++

      if (totalComments >= data.maxComments) {
        break
      }
    }

    return { usersProcessed, totalComments }
  }),
}
