/**
 * Order Processing Workflow
 * Demonstrates order creation with payment processing
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Order processing workflow: create order, process payment, send confirmation
 */
export const orderProcessingWorkflow = pikkuWorkflowFunc<
  {
    customerId: string
    items: Array<{ productId: string; quantity: number; price: number }>
    paymentMethodId: string
  },
  { orderId: string; paymentId: string; status: string }
>({
  title: 'Order Processing',
  tags: ['ecommerce'],
  func: async (_services, data, { workflow }) => {
    // Step 1: Create the order
    const order = await workflow.do('Create order', 'orderCreate', {
      customerId: data.customerId,
      items: data.items,
    })

    // Step 2: Process payment
    const payment = await workflow.do('Process payment', 'paymentProcess', {
      orderId: order.id,
      amount: order.total,
      currency: 'USD',
      paymentMethodId: data.paymentMethodId,
    })

    // Step 3: Update order status based on payment
    if (payment.status === 'completed') {
      await workflow.do('Update order to paid', 'orderUpdate', {
        orderId: order.id,
        status: 'paid',
      })

      // Step 4: Send confirmation email
      await workflow.do('Send order confirmation', 'emailSend', {
        to: `customer-${data.customerId}@example.com`,
        subject: `Order ${order.id} Confirmed`,
        body: `Your order for $${order.total} has been confirmed.`,
      })
    } else {
      await workflow.do('Update order to payment_failed', 'orderUpdate', {
        orderId: order.id,
        status: 'payment_failed',
      })
    }

    return {
      orderId: order.id,
      paymentId: payment.id,
      status: payment.status === 'completed' ? 'paid' : 'payment_failed',
    }
  },
})
