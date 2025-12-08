/**
 * Tag Categorization Workflow
 * Demonstrates categorizing tasks using tags
 */

import { pikkuWorkflowComplexFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Tag-based task categorization workflow
 */
export const tagCategorizationWorkflow = pikkuWorkflowComplexFunc<
  {
    tasks: Array<{
      title: string
      priority: 'high' | 'medium' | 'low'
      type: string
    }>
  },
  { categorizedTasks: Array<{ taskId: string; tags: string[] }> }
>({
  title: 'Tag Categorization',
  tags: ['task'],
  func: async (_services, data, { workflow }) => {
    const categorizedTasks: Array<{ taskId: string; tags: string[] }> = []

    for (const taskData of data.tasks) {
      // Create task
      const task = await workflow.do(
        `Create task: ${taskData.title}`,
        'taskCreate',
        {
          title: taskData.title,
        }
      )

      const tags: string[] = []

      // Add priority tag
      await workflow.do(
        `Add priority tag for ${taskData.title}`,
        'taskTagAdd',
        {
          taskId: task.id,
          tag: `priority:${taskData.priority}`,
        }
      )
      tags.push(`priority:${taskData.priority}`)

      // Add type tag
      await workflow.do(`Add type tag for ${taskData.title}`, 'taskTagAdd', {
        taskId: task.id,
        tag: `type:${taskData.type}`,
      })
      tags.push(`type:${taskData.type}`)

      // Add urgent tag for high priority
      if (taskData.priority === 'high') {
        await workflow.do(
          `Add urgent tag for ${taskData.title}`,
          'taskTagAdd',
          {
            taskId: task.id,
            tag: 'urgent',
          }
        )
        tags.push('urgent')
      }

      categorizedTasks.push({
        taskId: task.id,
        tags,
      })
    }

    return { categorizedTasks }
  },
})
