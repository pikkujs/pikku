import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphTaskCrudWorkflow = pikkuWorkflowGraph({
  name: 'graphTaskCrudWorkflow',
  nodes: {
    create_task: 'taskCreate',
    get_task: 'taskGet',
    update_task_status: 'taskUpdate',
    mark_task_completed: 'taskUpdate',
    delete_task: 'taskDelete',
  },
  config: {
    create_task: {
      next: 'get_task',
      input: (ref, template) => ({
        title: ref('trigger', 'title'),
        description: ref('trigger', 'description'),
      }),
    },
    get_task: {
      next: 'update_task_status',
      input: (ref, template) => ({
        taskId: ref('create_task', 'id'),
      }),
    },
    update_task_status: {
      next: 'mark_task_completed',
      input: (ref, template) => ({
        taskId: ref('create_task', 'id'),
        status: 'in_progress',
      }),
    },
    mark_task_completed: {
      next: 'delete_task',
      input: (ref, template) => ({
        taskId: ref('create_task', 'id'),
        status: 'completed',
      }),
    },
    delete_task: {
      input: (ref, template) => ({
        taskId: ref('create_task', 'id'),
      }),
    },
  },
})
