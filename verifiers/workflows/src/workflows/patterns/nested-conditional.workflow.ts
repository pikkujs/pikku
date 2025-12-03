/**
 * Nested conditional workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const nestedConditionalWorkflow = pikkuWorkflowFunc<
  { leadId: string; score: number; hasCompany: boolean; budget: number },
  { route: string; assignedTo: string }
>(async (_services, data, { workflow }) => {
  let route = 'default'
  let assignedTo = 'general-queue'

  // Outer condition: score threshold
  if (data.score >= 80) {
    // High score leads
    if (data.budget > 50000) {
      // High budget - enterprise route
      route = 'enterprise'
      assignedTo = 'enterprise-team'

      await workflow.do('Route to enterprise', 'leadAssign', {
        leadId: data.leadId,
        salesRepId: 'enterprise-rep',
      })
    } else if (data.hasCompany) {
      // Has company - business route
      route = 'business'
      assignedTo = 'business-team'

      await workflow.do('Route to business', 'leadAssign', {
        leadId: data.leadId,
        salesRepId: 'business-rep',
      })
    } else {
      // Individual high-value
      route = 'premium-individual'
      assignedTo = 'premium-rep'

      await workflow.do('Route to premium individual', 'leadAssign', {
        leadId: data.leadId,
        salesRepId: 'premium-rep',
      })
    }
  } else if (data.score >= 50) {
    // Medium score leads
    if (data.hasCompany) {
      route = 'business-nurture'
      assignedTo = 'nurture-team'
    } else {
      route = 'individual-nurture'
      assignedTo = 'nurture-team'
    }

    await workflow.do('Add to nurture', 'emailSend', {
      to: `lead-${data.leadId}@example.com`,
      subject: 'Stay Connected',
      body: 'We have resources that might interest you.',
    })
  } else {
    // Low score - disqualify
    route = 'disqualified'
    assignedTo = 'none'

    await workflow.do('Disqualify lead', 'leadReject', {
      leadId: data.leadId,
      reason: 'Score below threshold',
    })
  }

  return { route, assignedTo }
})
