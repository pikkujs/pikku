/**
 * Deal stage change with approval workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const dealStageWithApprovalWorkflow = pikkuWorkflowFunc<
  { dealId: string; targetStage: string; requiresApproval: boolean },
  { moved: boolean; approved: boolean }
>(async (_services, data, { workflow }) => {
  // Step 1: Get current deal
  const deal = await workflow.do('Get deal', 'dealGet', {
    dealId: data.dealId,
  })

  let approved = true

  // Step 2: Check if approval required
  if (data.requiresApproval) {
    // Request approval
    await workflow.do('Request approval', 'notifyEmail', {
      userId: 'sales-manager',
      subject: `Approval Required: Move deal to ${data.targetStage}`,
      body: `Deal "${deal.title}" worth ${deal.currency} ${deal.value} needs approval to move to ${data.targetStage}.`,
    })

    // Wait for approval processing
    await workflow.sleep('Wait for approval', '2s')

    // In real workflow, this would check approval status
    // For mock, we'll approve high-value deals
    approved = deal.value > 10000
  }

  // Step 3: Move stage if approved
  let moved = false
  if (approved) {
    await workflow.do('Move deal stage', 'dealStageMove', {
      dealId: data.dealId,
      fromStage: deal.stage,
      toStage: data.targetStage,
    })
    moved = true

    // Notify team
    await workflow.do('Notify stage change', 'notifySlack', {
      channel: '#deals',
      message: `Deal "${deal.title}" moved to ${data.targetStage}`,
    })
  } else {
    await workflow.do('Notify rejection', 'notifyEmail', {
      userId: 'sales-rep-1',
      subject: 'Deal Stage Change Rejected',
      body: `Stage change for deal "${deal.title}" was not approved.`,
    })
  }

  return { moved, approved }
})
