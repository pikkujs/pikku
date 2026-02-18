import { pikkuWorkflowFunc } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const taskCrudWorkflow = pikkuWorkflowFunc<
  { title: string; description?: string; requiresApproval?: boolean },
  { taskId: string; finalStatus: string; processorVersion: string }
>({
  tags: ['task', 'workflow'],
  func: async (_services, data, { workflow }) => {
    const task = await workflow.do('Create task', 'taskCreate', {
      title: data.title,
      description: data.description,
    })

    if (data.requiresApproval) {
      await workflow.suspend('Needs human approval before status updates')
    }

    await workflow.do('Mark in progress', 'taskUpdate', {
      taskId: task.id,
      status: 'in_progress',
    })

    const completed = await workflow.do('Mark completed', 'taskUpdate', {
      taskId: task.id,
      status: 'completed',
    })

    return {
      taskId: task.id,
      finalStatus: completed.status,
      processorVersion: task.processorVersion,
    }
  },
})
