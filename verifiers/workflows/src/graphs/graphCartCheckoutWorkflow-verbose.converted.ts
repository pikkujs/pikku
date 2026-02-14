import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphCartCheckoutWorkflow = pikkuWorkflowGraph({
  name: 'graphCartCheckoutWorkflow',
  tags: ['ecommerce'],
  nodes: {
    get_cart: 'cartGet',
    checkout_cart: 'cartCheckout',
    authorize_payment: 'paymentAuthorize',
    reserve_item_productid: 'inventoryReserve',
    capture_payment: 'paymentCapture',
    update_order_to_paid: 'orderUpdate',
    send_order_confirmation: 'emailSend',
  },
  config: {
    get_cart: {
      next: 'checkout_cart',
      input: (ref, template) => ({
        customerId: ref('trigger', 'customerId'),
      }),
    },
    checkout_cart: {
      next: 'authorize_payment',
      input: (ref, template) => ({
        customerId: ref('trigger', 'customerId'),
        shippingAddress: ref('trigger', 'shippingAddress'),
        paymentMethodId: ref('trigger', 'paymentMethodId'),
      }),
    },
    authorize_payment: {
      next: 'reserve_item_productid',
      input: (ref, template) => ({
        orderId: ref('checkout_cart', 'orderId'),
        amount: ref('checkout_cart', 'total'),
        currency: 'USD',
        paymentMethodId: ref('trigger', 'paymentMethodId'),
      }),
    },
    reserve_item_productid: {
      input: (ref, template) => ({
        orderId: ref('checkout_cart', 'orderId'),
      }),
    },
    capture_payment: {
      next: 'update_order_to_paid',
      input: (ref, template) => ({
        paymentId: ref('authorize_payment', 'id'),
        amount: ref('checkout_cart', 'total'),
      }),
    },
    update_order_to_paid: {
      next: 'send_order_confirmation',
      input: (ref, template) => ({
        orderId: ref('checkout_cart', 'orderId'),
        status: 'paid',
      }),
    },
    send_order_confirmation: {
      input: (ref, template) => ({
        to: template('customer-$0@example.com', [ref('trigger', 'customerId')]),
        subject: 'Order Confirmed!',
        body: template('Your order $0 for $$1 has been placed.', [
          ref('checkout_cart', 'orderId'),
          ref('checkout_cart', 'total'),
        ]),
      }),
    },
  },
})
