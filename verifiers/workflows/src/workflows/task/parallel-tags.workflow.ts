/**
 * Parallel Tags Workflow
 * Demonstrates adding and removing tags in parallel
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Parallel tag operations workflow
 */
export const parallelTagsWorkflow = pikkuWorkflowFunc<
  { taskId: string; tagsToAdd: string[]; tagsToRemove: string[] },
  { addedCount: number; removedCount: number }
>(async (_services, data, { workflow }) => {
  // Add all tags in parallel
  await Promise.all(
    data.tagsToAdd.map(
      async (tag) =>
        await workflow.do(`Add tag ${tag}`, 'taskTagAdd', {
          taskId: data.taskId,
          tag,
        })
    )
  )

  // Remove tags in parallel
  await Promise.all(
    data.tagsToRemove.map(
      async (tag) =>
        await workflow.do(`Remove tag ${tag}`, 'taskTagRemove', {
          taskId: data.taskId,
          tag,
        })
    )
  )

  return {
    addedCount: data.tagsToAdd.length,
    removedCount: data.tagsToRemove.length,
  }
})
