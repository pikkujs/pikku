/**
 * Digest Builder Workflow
 * Demonstrates collecting items and building digest notifications
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const digestBuilderWorkflow = pikkuWorkflowFunc<
  { userId: string; since: string; format: 'html' | 'text' },
  { itemCount: number; sent: boolean }
>({
  title: 'Digest Builder',
  tags: ['notification'],
  func: async (_services, data, { workflow }) => {
    // Step 1: Collect digest items
    const digest = await workflow.do('Collect digest items', 'digestCollect', {
      userId: data.userId,
      since: data.since,
    })

    // Step 2: Check if there are items to send
    if (digest.items.length === 0) {
      return {
        itemCount: 0,
        sent: false,
      }
    }

    // Step 3: Format the digest
    const formatted = await workflow.do('Format digest', 'digestFormat', {
      items: digest.items,
      format: data.format,
    })

    // Step 4: Send the digest
    await workflow.do('Send digest', 'emailSend', {
      to: `user-${data.userId}@example.com`,
      subject: `Your Daily Digest - ${formatted.itemCount} updates`,
      body: formatted.formatted,
    })

    return {
      itemCount: formatted.itemCount,
      sent: true,
    }
  },
})
