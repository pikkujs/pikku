/**
 * Pipeline aggregation workflow
 */

import { pikkuWorkflowComplexFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const pipelineAggregationWorkflow = {
  title: 'Pipeline Aggregation',
  tags: ['patterns'],
  func: pikkuWorkflowComplexFunc<
    { leadIds: string[] },
    {
      totalLeads: number
      qualifiedLeads: number
      dealsCreated: number
      totalValue: number
    }
  >(async (_services, data, { workflow }) => {
    // Stage 1: Get all leads in parallel
    const leads = await Promise.all(
      data.leadIds.map(
        async (leadId) =>
          await workflow.do(`Get lead ${leadId}`, 'leadGet', { leadId })
      )
    )

    // Stage 2: Score all leads in parallel
    const scoredLeads = await Promise.all(
      leads.map(
        async (lead) =>
          await workflow.do(`Score lead ${lead.id}`, 'leadScore', {
            leadId: lead.id,
            criteria: {
              hasEmail: !!lead.email,
              hasCompany: !!lead.company,
              engagementLevel: 'medium',
            },
          })
      )
    )

    // Stage 3: Filter qualified leads
    const qualifiedLeadIds = scoredLeads
      .filter((scored) => scored.score >= 50)
      .map((scored) => scored.leadId)

    // Stage 4: Create deals for qualified leads in parallel
    const deals = await Promise.all(
      qualifiedLeadIds.map(
        async (leadId) =>
          await workflow.do(`Create deal for ${leadId}`, 'dealCreate', {
            leadId,
            title: `Deal for lead ${leadId}`,
            value: 10000,
            currency: 'USD',
          })
      )
    )

    // Aggregate results
    const totalValue = deals.reduce((sum, deal) => sum + deal.value, 0)

    return {
      totalLeads: leads.length,
      qualifiedLeads: qualifiedLeadIds.length,
      dealsCreated: deals.length,
      totalValue,
    }
  }),
}
