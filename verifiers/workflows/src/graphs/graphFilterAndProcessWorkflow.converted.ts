import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphFilterAndProcessWorkflow = pikkuWorkflowGraph({
  name: 'graphFilterAndProcessWorkflow',
  nodes: {
    process_high_priority_item_item_id: 'taskCreate',
  },
  config: {
    process_high_priority_item_item_id: {
      input: (ref, template) => ({
        title: template('Process $0', [{ $ref: 'item.id' } as any]),
        description: template('Priority: $0', [
          { $ref: 'item.priority' } as any,
        ]),
      }),
    },
  },
})
