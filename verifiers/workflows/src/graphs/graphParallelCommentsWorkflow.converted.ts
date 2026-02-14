import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphParallelCommentsWorkflow = pikkuWorkflowGraph({
  name: 'graphParallelCommentsWorkflow',
  nodes: {
    add_comment_index_1: 'taskCommentAdd',
  },
  config: {
    add_comment_index_1: {
      input: (ref, template) => ({
        taskId: ref('trigger', 'taskId'),
      }),
    },
  },
})
