/**
 * Distributed transaction saga workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const distributedTransactionSagaWorkflow = pikkuWorkflowFunc<
  {
    sourceAccountId: string
    targetAccountId: string
    amount: number
  },
  { transferId: string; status: string }
>(async (_services, data, { workflow }) => {
  // Step 1: Debit source account (mock via payment process)
  const debit = await workflow.do('Debit source account', 'paymentProcess', {
    orderId: `transfer-${Date.now()}`,
    amount: data.amount,
    currency: 'USD',
    paymentMethodId: data.sourceAccountId,
  })

  // Step 2: Credit target account (mock via payment refund as credit)
  await workflow.do('Credit target account', 'paymentRefund', {
    paymentId: `account-${data.targetAccountId}`,
    amount: data.amount,
    reason: 'Transfer credit',
  })

  // Step 3: Record transfer
  await workflow.do('Record transfer', 'notifySlack', {
    channel: '#transfers',
    message: `Transfer of ${data.amount} from ${data.sourceAccountId} to ${data.targetAccountId} completed`,
  })

  // Step 4: Notify both parties
  await Promise.all([
    workflow.do('Notify sender', 'notifyEmail', {
      userId: data.sourceAccountId,
      subject: 'Transfer Sent',
      body: `You sent ${data.amount} to ${data.targetAccountId}`,
    }),
    workflow.do('Notify recipient', 'notifyEmail', {
      userId: data.targetAccountId,
      subject: 'Transfer Received',
      body: `You received ${data.amount} from ${data.sourceAccountId}`,
    }),
  ])

  return {
    transferId: debit.id,
    status: 'completed',
  }
})
