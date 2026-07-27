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
>({
  title: 'Nested Task Hierarchy',
  tags: ['task'],
  func: async (_services, data, { workflow }) => {
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

    // Create second level of subtasks for each level 1 subtask. The parent ×
    // title cross product is built up front as plain locals, because a DSL
    // fanout body is a flat list of steps with no nested-fanout member — one
    // fanout over the pairs is how the DSL expresses a nested loop, and it
    // visits them in exactly the order the nested loops did.
    const level2Pairs: { parentTaskId: string; title: string }[] = []
    for (const parentTaskId of level1Subtasks) {
      for (const title of data.level2Titles) {
        level2Pairs.push({ parentTaskId, title })
      }
    }

    for (const pair of level2Pairs) {
      await workflow.do(
        `Create level 2 subtask: ${pair.title}`,
        'subtaskCreate',
        {
          parentTaskId: pair.parentTaskId,
          title: pair.title,
        }
      )
      totalTasksCreated++
    }

    return {
      rootTaskId: rootTask.id,
      totalTasksCreated,
    }
  },
})
