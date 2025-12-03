/**
 * Retry with Backoff Workflow
 * Demonstrates retry patterns with exponential backoff
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Retry with exponential backoff workflow
 */
export const retryWithBackoffWorkflow = pikkuWorkflowFunc<
  { userId: string; message: string },
  { success: boolean; attempts: number }
>({
  title: 'Retry With Backoff',
  tags: ['patterns'],
  func: async (_services, data, { workflow }) => {
    // Send notification with retry configuration
    await workflow.do(
      'Send notification with retry',
      'notifyEmail',
      {
        userId: data.userId,
        subject: 'Important Message',
        body: data.message,
      },
      {
        retries: 3,
        retryDelay: '1s', // Exponential backoff is handled by the workflow engine
      }
    )

    return {
      success: true,
      attempts: 1, // In reality would be tracked by workflow engine
    }
  },
})
