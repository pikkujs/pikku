import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphComplexConditionalBranchingWorkflow = pikkuWorkflowGraph({
  name: 'graphComplexConditionalBranchingWorkflow',
  nodes: {
    apply_vip_benefits: 'notifyEmail',
    apply_returning_customer_discount: 'notifyEmail',
    send_welcome_offer: 'notifyEmail',
    apply_promo_code: 'taskCreate',
  },
  config: {
    apply_vip_benefits: {
      input: (ref, template) => ({
        userId: ref('trigger', 'customerId'),
        subject: 'VIP Benefits Applied',
        body: 'Thank you for being a VIP customer!',
      }),
    },
    apply_returning_customer_discount: {
      input: (ref, template) => ({
        userId: ref('trigger', 'customerId'),
        subject: 'Loyalty Discount Applied',
        body: 'Thank you for your continued support!',
      }),
    },
    send_welcome_offer: {
      input: (ref, template) => ({
        userId: ref('trigger', 'customerId'),
        subject: "Welcome! Here's Your First Order Discount",
        body: 'Enjoy 15% off your first order!',
      }),
    },
    apply_promo_code: {
      input: (ref, template) => ({
        title: 'Process promo code for order',
        description: template('Customer $0 used promo code', [
          ref('trigger', 'customerId'),
        ]),
      }),
    },
  },
})
