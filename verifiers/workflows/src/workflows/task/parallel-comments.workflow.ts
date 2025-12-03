/**
 * Parallel Comments Workflow
 * Demonstrates adding multiple comments in parallel
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Parallel comment addition workflow
 */
export const parallelCommentsWorkflow = pikkuWorkflowFunc<
  { taskId: string; comments: Array<{ content: string; authorId: string }> },
  { addedCount: number }
>(async (_services, data, { workflow }) => {
  // Add all comments in parallel
  await Promise.all(
    data.comments.map(
      async (comment, index) =>
        await workflow.do(`Add comment ${index + 1}`, 'taskCommentAdd', {
          taskId: data.taskId,
          content: comment.content,
          authorId: comment.authorId,
        })
    )
  )

  return {
    addedCount: data.comments.length,
  }
})
