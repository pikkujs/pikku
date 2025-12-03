/**
 * Nested Task Hierarchy Workflow
 * Demonstrates creating a multi-level task hierarchy
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Nested task hierarchy workflow
 */
export const nestedTaskHierarchyWorkflow = pikkuWorkflowFunc<
  { rootTitle: string; level1Titles: string[]; level2Titles: string[] },
  { rootTaskId: string; totalTasksCreated: number }
>(async (_services, data, { workflow }) => {
  let totalTasksCreated = 1

  // Create root task
  const rootTask = await workflow.do('Create root task', 'taskCreate', {
    title: data.rootTitle,
  })

  // Create first level of subtasks
  const level1Subtasks: string[] = []
  for (const title of data.level1Titles) {
    const subtask = await workflow.do(
      `Create level 1 subtask: ${title}`,
      'subtaskCreate',
      {
        parentTaskId: rootTask.id,
        title,
      }
    )
    level1Subtasks.push(subtask.id)
    totalTasksCreated++
  }

  // Create second level of subtasks for each level 1 subtask
  for (const parentId of level1Subtasks) {
    for (const title of data.level2Titles) {
      await workflow.do(`Create level 2 subtask: ${title}`, 'subtaskCreate', {
        parentTaskId: parentId,
        title,
      })
      totalTasksCreated++
    }
  }

  return {
    rootTaskId: rootTask.id,
    totalTasksCreated,
  }
})
