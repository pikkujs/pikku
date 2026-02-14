import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphDealStageWithApprovalWorkflow = pikkuWorkflowGraph({
  name: 'graphDealStageWithApprovalWorkflow',
  nodes: {
    get_deal: 'dealGet',
    request_approval: 'notifyEmail',
    move_deal_stage: 'dealStageMove',
    notify_stage_change: 'notifySlack',
    notify_rejection: 'notifyEmail',
  },
  config: {
    get_deal: {
      input: (ref, template) => ({
        dealId: ref('trigger', 'dealId'),
      }),
    },
    request_approval: {
      input: (ref, template) => ({
        userId: 'sales-manager',
        subject: template('Approval Required: Move deal to $0', [
          ref('trigger', 'targetStage'),
        ]),
        body: template('Deal "$0" worth $1 $2 needs approval to move to $3.', [
          ref('get_deal', 'title'),
          ref('get_deal', 'currency'),
          ref('get_deal', 'value'),
          ref('trigger', 'targetStage'),
        ]),
      }),
    },
    move_deal_stage: {
      next: 'notify_stage_change',
      input: (ref, template) => ({
        dealId: ref('trigger', 'dealId'),
        fromStage: ref('get_deal', 'stage'),
        toStage: ref('trigger', 'targetStage'),
      }),
    },
    notify_stage_change: {
      input: (ref, template) => ({
        channel: '#deals',
        message: template('Deal "$0" moved to $1', [
          ref('get_deal', 'title'),
          ref('trigger', 'targetStage'),
        ]),
      }),
    },
    notify_rejection: {
      input: (ref, template) => ({
        userId: 'sales-rep-1',
        subject: 'Deal Stage Change Rejected',
        body: template('Stage change for deal "$0" was not approved.', [
          ref('get_deal', 'title'),
        ]),
      }),
    },
  },
})
