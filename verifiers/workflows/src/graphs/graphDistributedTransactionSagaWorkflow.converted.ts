import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphDistributedTransactionSagaWorkflow = pikkuWorkflowGraph({
  name: 'graphDistributedTransactionSagaWorkflow',
  nodes: {
    debit_source_account: 'paymentProcess',
    credit_target_account: 'paymentRefund',
    record_transfer: 'notifySlack',
    notify_sender: 'notifyEmail',
    notify_recipient: 'notifyEmail',
  },
  config: {
    debit_source_account: {
      next: 'credit_target_account',
      input: (ref, template) => ({
        orderId: template('transfer-$0', [{ $ref: 'Date.now()' } as any]),
        amount: ref('trigger', 'amount'),
        currency: 'USD',
        paymentMethodId: ref('trigger', 'sourceAccountId'),
      }),
    },
    credit_target_account: {
      next: 'record_transfer',
      input: (ref, template) => ({
        paymentId: template('account-$0', [ref('trigger', 'targetAccountId')]),
        amount: ref('trigger', 'amount'),
        reason: 'Transfer credit',
      }),
    },
    record_transfer: {
      input: (ref, template) => ({
        channel: '#transfers',
        message: template('Transfer of $0 from $1 to $2 completed', [
          ref('trigger', 'amount'),
          ref('trigger', 'sourceAccountId'),
          ref('trigger', 'targetAccountId'),
        ]),
      }),
    },
    notify_sender: {
      next: 'notify_recipient',
      input: (ref, template) => ({
        userId: ref('trigger', 'sourceAccountId'),
        subject: 'Transfer Sent',
        body: template('You sent $0 to $1', [
          ref('trigger', 'amount'),
          ref('trigger', 'targetAccountId'),
        ]),
      }),
    },
    notify_recipient: {
      input: (ref, template) => ({
        userId: ref('trigger', 'targetAccountId'),
        subject: 'Transfer Received',
        body: template('You received $0 from $1', [
          ref('trigger', 'amount'),
          ref('trigger', 'sourceAccountId'),
        ]),
      }),
    },
  },
})
