/**
 * Conditional Branching Workflow
 * Demonstrates complex if/else chains and conditional logic
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Complex conditional branching workflow
 */
export const complexConditionalBranchingWorkflow = pikkuWorkflowFunc<
  {
    customerId: string
    orderValue: number
    customerType: 'new' | 'returning' | 'vip'
    hasPromoCode: boolean
  },
  { discount: number; freeShipping: boolean; priorityProcessing: boolean }
>(async (_services, data, { workflow }) => {
  let discount = 0
  let freeShipping = false
  let priorityProcessing = false

  // Complex conditional logic based on customer type and order value
  if (data.customerType === 'vip') {
    // VIP customers get best treatment
    discount = 20
    freeShipping = true
    priorityProcessing = true

    await workflow.do('Apply VIP benefits', 'notifyEmail', {
      userId: data.customerId,
      subject: 'VIP Benefits Applied',
      body: 'Thank you for being a VIP customer!',
    })
  } else if (data.customerType === 'returning' && data.orderValue > 100) {
    // Returning customers with high value orders
    discount = 10
    freeShipping = data.orderValue > 150

    await workflow.do('Apply returning customer discount', 'notifyEmail', {
      userId: data.customerId,
      subject: 'Loyalty Discount Applied',
      body: 'Thank you for your continued support!',
    })
  } else if (data.customerType === 'new') {
    // New customers get welcome discount
    discount = 15
    freeShipping = false

    await workflow.do('Send welcome offer', 'notifyEmail', {
      userId: data.customerId,
      subject: "Welcome! Here's Your First Order Discount",
      body: 'Enjoy 15% off your first order!',
    })
  } else {
    // Default case
    discount = 0

    if (data.orderValue > 200) {
      freeShipping = true
    }
  }

  // Additional promo code logic
  if (data.hasPromoCode) {
    discount = Math.min(discount + 5, 30) // Cap at 30%
    await workflow.do('Apply promo code', 'taskCreate', {
      title: `Process promo code for order`,
      description: `Customer ${data.customerId} used promo code`,
    })
  }

  return { discount, freeShipping, priorityProcessing }
})
