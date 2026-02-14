import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphParallelTagsWorkflow = pikkuWorkflowGraph({
  name: 'graphParallelTagsWorkflow',
  tags: ['task'],
  nodes: {
    add_tag_tag: 'taskTagAdd',
    remove_tag_tag: 'taskTagRemove',
  },
  config: {
    add_tag_tag: {
      input: (ref, template) => ({
        taskId: ref('trigger', 'taskId'),
        tag: ref('$item', 'tag'),
      }),
    },
    remove_tag_tag: {
      input: (ref, template) => ({
        taskId: ref('trigger', 'taskId'),
        tag: ref('$item', 'tag'),
      }),
    },
  },
})
