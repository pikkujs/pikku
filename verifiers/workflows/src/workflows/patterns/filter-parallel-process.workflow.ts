/**
 * Filter with parallel processing workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const filterParallelProcessWorkflow = pikkuWorkflowFunc<
  { emails: string[] },
  { validCount: number; invalidCount: number }
>({
  title: 'Filter Parallel Process',
  tags: ['patterns'],
  func: async (_services, data, { workflow }) => {
    // Filter valid emails
    const validEmails = data.emails.filter(
      (email) => email.includes('@') && email.includes('.')
    )
    const invalidEmails = data.emails.filter(
      (email) => !email.includes('@') || !email.includes('.')
    )

    // Process valid emails in parallel
    await Promise.all(
      validEmails.map(
        async (email) =>
          await workflow.do(`Send to ${email}`, 'emailSend', {
            to: email,
            subject: 'Welcome',
            body: 'Thank you for subscribing!',
          })
      )
    )

    // Log invalid emails
    if (invalidEmails.length > 0) {
      await workflow.do('Log invalid emails', 'notifySlack', {
        channel: '#email-issues',
        message: `${invalidEmails.length} invalid emails found`,
      })
    }

    return {
      validCount: validEmails.length,
      invalidCount: invalidEmails.length,
    }
  },
})
