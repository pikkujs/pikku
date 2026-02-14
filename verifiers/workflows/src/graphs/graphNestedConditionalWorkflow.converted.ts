import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphNestedConditionalWorkflow = pikkuWorkflowGraph({
  name: 'graphNestedConditionalWorkflow',
  nodes: {
    route_to_enterprise: 'leadAssign',
    route_to_business: 'leadAssign',
    route_to_premium_individual: 'leadAssign',
    add_to_nurture: 'emailSend',
    disqualify_lead: 'leadReject',
  },
  config: {
    route_to_enterprise: {
      input: (ref, template) => ({
        leadId: ref('trigger', 'leadId'),
        salesRepId: 'enterprise-rep',
      }),
    },
    route_to_business: {
      input: (ref, template) => ({
        leadId: ref('trigger', 'leadId'),
        salesRepId: 'business-rep',
      }),
    },
    route_to_premium_individual: {
      input: (ref, template) => ({
        leadId: ref('trigger', 'leadId'),
        salesRepId: 'premium-rep',
      }),
    },
    add_to_nurture: {
      input: (ref, template) => ({
        to: template('lead-$0@example.com', [ref('trigger', 'leadId')]),
        subject: 'Stay Connected',
        body: 'We have resources that might interest you.',
      }),
    },
    disqualify_lead: {
      input: (ref, template) => ({
        leadId: ref('trigger', 'leadId'),
        reason: 'Score below threshold',
      }),
    },
  },
})
