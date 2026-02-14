import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphNestedTaskHierarchyWorkflow = pikkuWorkflowGraph({
  name: 'graphNestedTaskHierarchyWorkflow',
  nodes: {
    create_root_task: 'taskCreate',
    create_level_1_subtask_title: 'subtaskCreate',
  },
  config: {
    create_root_task: {
      next: 'create_level_1_subtask_title',
      input: (ref, template) => ({
        title: ref('trigger', 'rootTitle'),
      }),
    },
    create_level_1_subtask_title: {
      input: (ref, template) => ({
        parentTaskId: ref('create_root_task', 'id'),
        title: ref('$item', 'title'),
      }),
    },
  },
})
