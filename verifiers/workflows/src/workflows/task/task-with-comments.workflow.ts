/**
 * Task Comments Workflow
 * Demonstrates task creation with comment management
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Task with comments workflow: create task, add comments, list, remove
 */
export const taskWithCommentsWorkflow = pikkuWorkflowFunc<
  { title: string; comments: Array<{ content: string; authorId: string }> },
  { taskId: string; commentIds: string[]; finalCommentCount: number }
>({
  title: 'Task with Comments',
  tags: ['task'],
  func: async (_services, data, { workflow }) => {
    // Step 1: Create the task
    const task = await workflow.do('Create task', 'taskCreate', {
      title: data.title,
    })

    // Step 2: Add comments sequentially
    const commentIds: string[] = []
    for (const comment of data.comments) {
      const addedComment = await workflow.do(
        `Add comment by ${comment.authorId}`,
        'taskCommentAdd',
        {
          taskId: task.id,
          content: comment.content,
          authorId: comment.authorId,
        }
      )
      commentIds.push(addedComment.id)
    }

    // Step 3: List all comments
    await workflow.do('List task comments', 'taskCommentList', {
      taskId: task.id,
    })

    // Step 4: Remove the first comment if exists
    if (commentIds.length > 0) {
      await workflow.do('Remove first comment', 'taskCommentRemove', {
        taskId: task.id,
        commentId: commentIds[0]!,
      })
    }

    // Step 5: List comments again to verify removal
    const finalCommentList = await workflow.do(
      'List remaining comments',
      'taskCommentList',
      {
        taskId: task.id,
      }
    )

    return {
      taskId: task.id,
      commentIds,
      finalCommentCount: finalCommentList.comments.length,
    }
  },
})
