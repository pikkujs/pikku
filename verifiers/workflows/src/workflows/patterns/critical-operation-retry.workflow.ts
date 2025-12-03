/**
 * Critical operation with high retry count workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const criticalOperationRetryWorkflow = pikkuWorkflowFunc<
  { operationId: string; maxAttempts: number },
  { completed: boolean }
>(async (_services, data, { workflow }) => {
  // Critical payment capture with many retries
  await workflow.do(
    'Critical payment capture',
    'paymentCapture',
    {
      paymentId: data.operationId,
      amount: 1000,
    },
    { retries: 5, retryDelay: '5s' }
  )

  // Notify on success
  await workflow.do('Notify success', 'notifySlack', {
    channel: '#payments',
    message: `Critical operation ${data.operationId} completed successfully`,
  })

  return { completed: true }
})
