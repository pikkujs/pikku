/**
 * Parallel Subtasks Workflow
 * Demonstrates creating multiple subtasks in parallel
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Parallel subtask creation workflow
 */
export const parallelSubtasksWorkflow = pikkuWorkflowFunc<
  { parentTaskId: string; subtaskTitles: string[] },
  { createdCount: number }
>(async (_services, data, { workflow }) => {
  // Create all subtasks in parallel
  await Promise.all(
    data.subtaskTitles.map(
      async (title, index) =>
        await workflow.do(`Create subtask ${index + 1}`, 'subtaskCreate', {
          parentTaskId: data.parentTaskId,
          title,
        })
    )
  )

  return {
    createdCount: data.subtaskTitles.length,
  }
})
