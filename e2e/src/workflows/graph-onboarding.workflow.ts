import { pikkuWorkflowFunc } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphOnboarding = pikkuWorkflowFunc<
  { title: string; description?: string },
  { taskId: string; finalStatus: string }
>({
  tags: ['task', 'workflow', 'graph'],
  func: async (_services, data, { workflow }) => {
    const task = await workflow.do('Register project', 'taskCreate', {
      title: data.title,
      description: data.description,
    })

    await workflow.do('Process onboarding item', 'processItem', {
      itemId: task.id,
      payload: 'onboarding',
    })

    const completed = await workflow.do('Finalize onboarding', 'taskUpdate', {
      taskId: task.id,
      status: 'completed',
    })

    return {
      taskId: task.id,
      finalStatus: completed.status,
    }
  },
})
