import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphWeeklySummaryDigestWorkflow = pikkuWorkflowGraph({
  name: 'graphWeeklySummaryDigestWorkflow',
  tags: ['notification'],
  nodes: {
    get_task_activity: 'taskList',
    get_user: 'userGet',
    send_weekly_summary: 'emailSendTemplate',
  },
  config: {
    get_task_activity: {
      next: 'get_user',
      input: () => ({
        status: 'completed',
        limit: 50,
      }),
    },
    get_user: {
      next: 'send_weekly_summary',
      input: (ref, template) => ({
        userId: ref('trigger', 'userId'),
      }),
    },
    send_weekly_summary: {
      input: (ref, template) => ({
        to: ref('get_user', 'email'),
        templateId: 'weekly-summary',
        variables: { userName: ref('get_user', 'name') },
      }),
    },
  },
})
