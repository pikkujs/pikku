/**
 * Scheduled digest for multiple users workflow
 */

import { pikkuWorkflowComplexFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const scheduledDigestComplexWorkflow = pikkuWorkflowComplexFunc<
  { userIds: string[]; since: string },
  { sentCount: number; skippedCount: number }
>(async (_services, data, { workflow }) => {
  let sentCount = 0
  let skippedCount = 0

  for (const userId of data.userIds) {
    // Collect digest
    const digest = await workflow.do(`Collect for ${userId}`, 'digestCollect', {
      userId,
      since: data.since,
    })

    if (digest.items.length === 0) {
      skippedCount++
      continue
    }

    // Format
    const formatted = await workflow.do(
      `Format for ${userId}`,
      'digestFormat',
      {
        items: digest.items,
        format: 'html',
      }
    )

    // Send
    await workflow.do(`Send to ${userId}`, 'emailSend', {
      to: `user-${userId}@example.com`,
      subject: 'Your Activity Digest',
      body: formatted.formatted,
    })

    sentCount++

    // Rate limit
    await workflow.sleep(`Rate limit after ${userId}`, '50ms')
  }

  // Summary notification
  await workflow.do('Send summary', 'notifySlack', {
    channel: '#digests',
    message: `Digest batch complete: ${sentCount} sent, ${skippedCount} skipped`,
  })

  return { sentCount, skippedCount }
})
