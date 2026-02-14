import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphParallelSubtasksWorkflow = pikkuWorkflowGraph({
  name: 'graphParallelSubtasksWorkflow',
  nodes: {
    create_subtask_index_1: 'subtaskCreate',
  },
  config: {
    create_subtask_index_1: {
      input: (ref, template) => ({
        parentTaskId: ref('trigger', 'parentTaskId'),
        title: ref('$item', 'title'),
      }),
    },
  },
})
