/**
 * Bulk contact enrichment workflow
 */

import { pikkuWorkflowComplexFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const bulkContactEnrichmentWorkflow = pikkuWorkflowComplexFunc<
  { contactIds: string[] },
  { enrichedCount: number; failedCount: number }
>(async (_services, data, { workflow }) => {
  let enrichedCount = 0
  let failedCount = 0

  for (const contactId of data.contactIds) {
    // Get contact
    const contact = await workflow.do(
      `Get contact ${contactId}`,
      'contactGet',
      {
        contactId,
      }
    )

    // Try to enrich
    const enrichment = await workflow.do(
      `Enrich ${contactId}`,
      'contactEnrich',
      {
        contactId,
        email: contact.email,
      }
    )

    // Update if we got new data
    if (enrichment.enrichedData.company || enrichment.enrichedData.title) {
      await workflow.do(`Update ${contactId}`, 'contactUpdate', {
        contactId,
        data: {
          company: enrichment.enrichedData.company,
          title: enrichment.enrichedData.title,
        },
      })
      enrichedCount++
    } else {
      failedCount++
    }

    // Rate limiting delay
    await workflow.sleep(`Rate limit after ${contactId}`, '100ms')
  }

  // Send completion report
  await workflow.do('Send enrichment report', 'emailSend', {
    to: 'crm-admin@example.com',
    subject: 'Contact Enrichment Complete',
    body: `Enriched: ${enrichedCount}, Failed: ${failedCount}`,
  })

  return { enrichedCount, failedCount }
})
