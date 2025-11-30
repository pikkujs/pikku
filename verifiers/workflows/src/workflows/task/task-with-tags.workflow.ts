/**
 * Task Tags Workflow
 * Demonstrates task tagging operations
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Task with tags workflow: create task, add/remove tags
 */
export const taskWithTagsWorkflow = pikkuWorkflowFunc<
  { title: string; tags: string[]; tagsToRemove: string[] },
  { taskId: string; addedTags: string[]; removedTags: string[] }
>(async (_services, data, { workflow }) => {
  // Step 1: Create the task
  const task = await workflow.do('Create task', 'taskCreate', {
    title: data.title,
  })

  // Step 2: Add tags sequentially
  const addedTags: string[] = []
  for (const tag of data.tags) {
    await workflow.do(`Add tag: ${tag}`, 'taskTagAdd', {
      taskId: task.id,
      tag,
    })
    addedTags.push(tag)
  }

  // Step 3: Remove specified tags
  const removedTags: string[] = []
  for (const tag of data.tagsToRemove) {
    if (addedTags.includes(tag)) {
      await workflow.do(`Remove tag: ${tag}`, 'taskTagRemove', {
        taskId: task.id,
        tag,
      })
      removedTags.push(tag)
    }
  }

  return {
    taskId: task.id,
    addedTags,
    removedTags,
  }
})
