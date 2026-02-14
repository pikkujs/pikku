import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphMultiTierSwitchWorkflow = pikkuWorkflowGraph({
  name: 'graphMultiTierSwitchWorkflow',
  tags: ['patterns'],
  nodes: {
    notify_upgrade_required: 'notifyInApp',
  },
  config: {
    notify_upgrade_required: {
      input: (ref, template) => ({
        userId: 'current-user',
        title: 'Upgrade Required',
        body: template('The $0 feature requires a paid plan.', [
          ref('trigger', 'action'),
        ]),
      }),
    },
  },
})
