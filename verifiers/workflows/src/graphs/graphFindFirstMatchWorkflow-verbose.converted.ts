import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphFindFirstMatchWorkflow = pikkuWorkflowGraph({
  name: 'graphFindFirstMatchWorkflow',
  tags: ['patterns'],
  nodes: {
    assign_selected_candidate: 'leadAssign',
    notify_selection: 'notifyEmail',
    assign_fallback_candidate: 'leadAssign',
    no_candidates_available: 'notifySlack',
  },
  config: {
    assign_selected_candidate: {
      next: 'notify_selection',
      input: () => ({
        salesRepId: 'primary-rep',
      }),
    },
    notify_selection: {
      input: () => ({
        subject: 'You have been selected',
        body: 'Congratulations on being selected!',
      }),
    },
    assign_fallback_candidate: {
      input: () => ({
        salesRepId: 'secondary-rep',
      }),
    },
    no_candidates_available: {
      input: () => ({
        channel: '#alerts',
        message: 'No suitable candidates found',
      }),
    },
  },
})
