/**
 * Weekly summary digest workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const weeklySummaryDigestWorkflow = pikkuWorkflowFunc<
  { userId: string },
  { tasksSummary: number; projectsSummary: number }
>({
  title: 'Weekly Summary Digest',
  tags: ['notification'],
  func: async (_services, data, { workflow }) => {
    // Step 1: Collect task activity
    const tasks = await workflow.do('Get task activity', 'taskList', {
      status: 'completed',
      limit: 50,
    })

    // Step 2: Get user details
    const user = await workflow.do('Get user', 'userGet', {
      userId: data.userId,
    })

    // Step 3: Build summary
    const tasksSummary = tasks.tasks.length
    const projectsSummary = 5 // Mock value

    // Step 4: Send summary email
    await workflow.do('Send weekly summary', 'emailSendTemplate', {
      to: user.email,
      templateId: 'weekly-summary',
      variables: {
        userName: user.name,
        tasksCompleted: String(tasksSummary),
        projectsActive: String(projectsSummary),
      },
    })

    return { tasksSummary, projectsSummary }
  },
})
