/**
 * Contact merge workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const contactMergeWorkflow = pikkuWorkflowFunc<
  { primaryContactId: string; duplicateContactIds: string[] },
  { mergedCount: number }
>(async (_services, data, { workflow }) => {
  // Step 1: Get primary contact
  const primaryContact = await workflow.do(
    'Get primary contact',
    'contactGet',
    {
      contactId: data.primaryContactId,
    }
  )

  // Step 2: Get all duplicate contacts
  const duplicates = await Promise.all(
    data.duplicateContactIds.map(
      async (id) =>
        await workflow.do(`Get duplicate ${id}`, 'contactGet', {
          contactId: id,
        })
    )
  )

  // Step 3: Merge data from duplicates to primary
  const mergedData: Record<string, string> = {}
  for (const dup of duplicates) {
    if (dup.phone && !primaryContact.phone) {
      mergedData.phone = dup.phone
    }
    if (dup.linkedIn && !primaryContact.linkedIn) {
      mergedData.linkedIn = dup.linkedIn
    }
  }

  if (Object.keys(mergedData).length > 0) {
    await workflow.do('Update primary with merged data', 'contactUpdate', {
      contactId: data.primaryContactId,
      data: mergedData,
    })
  }

  // Step 4: Notify completion
  await workflow.do('Notify merge complete', 'notifySlack', {
    channel: '#crm',
    message: `Merged ${data.duplicateContactIds.length} contacts into ${data.primaryContactId}`,
  })

  return {
    mergedCount: data.duplicateContactIds.length,
  }
})
