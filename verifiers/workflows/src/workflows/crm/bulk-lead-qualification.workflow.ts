/**
 * Bulk lead qualification workflow
 */

import { pikkuWorkflowComplexFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const bulkLeadQualificationWorkflow = pikkuWorkflowComplexFunc<
  { leadIds: string[]; minimumScore: number },
  { qualified: string[]; rejected: string[] }
>({
  title: 'Bulk Lead Qualification',
  tags: ['crm'],
  func: async (_services, data, { workflow }) => {
    const qualified: string[] = []
    const rejected: string[] = []

    for (const leadId of data.leadIds) {
      // Get and score lead
      const lead = await workflow.do(`Get lead ${leadId}`, 'leadGet', {
        leadId,
      })

      const scoring = await workflow.do(`Score lead ${leadId}`, 'leadScore', {
        leadId,
        criteria: {
          hasEmail: !!lead.email,
          hasCompany: !!lead.company,
          engagementLevel: 'medium',
        },
      })

      if (scoring.score >= data.minimumScore) {
        await workflow.do(`Assign lead ${leadId}`, 'leadAssign', {
          leadId,
          salesRepId: 'sales-rep-1',
        })
        qualified.push(leadId)
      } else {
        await workflow.do(`Reject lead ${leadId}`, 'leadReject', {
          leadId,
          reason: 'Below minimum score',
        })
        rejected.push(leadId)
      }
    }

    // Summary notification
    await workflow.do('Send summary', 'notifySlack', {
      channel: '#sales',
      message: `Lead qualification complete: ${qualified.length} qualified, ${rejected.length} rejected`,
    })

    return { qualified, rejected }
  },
})
