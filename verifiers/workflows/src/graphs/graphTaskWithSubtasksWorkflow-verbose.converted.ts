import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphTaskWithSubtasksWorkflow = pikkuWorkflowGraph({
  name: 'graphTaskWithSubtasksWorkflow',
  tags: ['task'],
  nodes: {
    create_parent_task: 'taskCreate',
    create_subtask_title: 'subtaskCreate',
    list_subtasks: 'subtaskList',
  },
  config: {
    create_parent_task: {
      next: 'create_subtask_title',
      input: (ref, template) => ({
        title: ref('trigger', 'parentTitle'),
      }),
    },
    create_subtask_title: {
      input: (ref, template) => ({
        parentTaskId: ref('create_parent_task', 'id'),
        title: ref('$item', 'title'),
      }),
    },
    list_subtasks: {
      input: (ref, template) => ({
        parentTaskId: ref('create_parent_task', 'id'),
      }),
    },
  },
})
