import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphMatrixIterationWorkflow = pikkuWorkflowGraph({
  name: 'graphMatrixIterationWorkflow',
  tags: ['patterns'],
  nodes: {
    log_row_row_complete: 'notifySlack',
  },
  config: {
    log_row_row_complete: {
      input: (ref, template) => ({
        channel: '#processing',
        message: template('Row $0 processing complete', [ref('$item', 'row')]),
      }),
    },
  },
})
