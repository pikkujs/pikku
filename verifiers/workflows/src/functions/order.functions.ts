/**
 * Order Management Functions
 * Mock implementations for e-commerce order processing
 */

import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'

// Order CRUD
export const orderCreate = pikkuSessionlessFunc<
  {
    customerId: string
    items: Array<{ productId: string; quantity: number; price: number }>
  },
  {
    id: string
    customerId: string
    items: Array<{ productId: string; quantity: number; price: number }>
    total: number
    status: string
    createdAt: string
  }
>({
  title: 'Create Order',
  func: async ({ logger }, data) => {
    const total = data.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    )
    logger.info(
      `Creating order for customer: ${data.customerId}, total: ${total}`
    )
    return {
      id: `order-${Date.now()}`,
      customerId: data.customerId,
      items: data.items,
      total,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
  },
})

export const orderGet = pikkuSessionlessFunc<
  { orderId: string },
  {
    id: string
    customerId: string
    items: Array<{ productId: string; quantity: number; price: number }>
    total: number
    status: string
    createdAt: string
  }
>({
  title: 'Get Order',
  func: async ({ logger }, data) => {
    logger.info(`Getting order: ${data.orderId}`)
    return {
      id: data.orderId,
      customerId: 'customer-1',
      items: [
        { productId: 'prod-1', quantity: 2, price: 29.99 },
        { productId: 'prod-2', quantity: 1, price: 49.99 },
      ],
      total: 109.97,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
  },
})

export const orderUpdate = pikkuSessionlessFunc<
  { orderId: string; status?: string; shippingAddress?: string },
  { id: string; status: string; updatedAt: string }
>({
  title: 'Update Order',
  func: async ({ logger }, data) => {
    logger.info(`Updating order: ${data.orderId}`)
    return {
      id: data.orderId,
      status: data.status || 'pending',
      updatedAt: new Date().toISOString(),
    }
  },
})

export const orderCancel = pikkuSessionlessFunc<
  { orderId: string; reason?: string },
  { id: string; status: string; cancelledAt: string; reason?: string }
>({
  title: 'Cancel Order',
  func: async ({ logger }, data) => {
    logger.info(`Cancelling order: ${data.orderId}`)
    return {
      id: data.orderId,
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      reason: data.reason,
    }
  },
})

export const orderList = pikkuSessionlessFunc<
  { customerId?: string; status?: string; limit?: number },
  {
    orders: Array<{
      id: string
      customerId: string
      total: number
      status: string
      createdAt: string
    }>
  }
>({
  title: 'List Orders',
  func: async ({ logger }, data) => {
    logger.info(`Listing orders for customer: ${data.customerId}`)
    return {
      orders: [
        {
          id: 'order-1',
          customerId: 'customer-1',
          total: 109.97,
          status: 'completed',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'order-2',
          customerId: 'customer-1',
          total: 59.99,
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'order-3',
          customerId: 'customer-2',
          total: 199.99,
          status: 'shipped',
          createdAt: new Date().toISOString(),
        },
      ],
    }
  },
})

// Order Items
export const orderItemAdd = pikkuSessionlessFunc<
  { orderId: string; productId: string; quantity: number; price: number },
  {
    orderId: string
    productId: string
    quantity: number
    price: number
    addedAt: string
  }
>({
  title: 'Add Order Item',
  func: async ({ logger }, data) => {
    logger.info(`Adding item ${data.productId} to order: ${data.orderId}`)
    return {
      orderId: data.orderId,
      productId: data.productId,
      quantity: data.quantity,
      price: data.price,
      addedAt: new Date().toISOString(),
    }
  },
})

export const orderItemRemove = pikkuSessionlessFunc<
  { orderId: string; productId: string },
  { orderId: string; productId: string; removed: boolean }
>({
  title: 'Remove Order Item',
  func: async ({ logger }, data) => {
    logger.info(`Removing item ${data.productId} from order: ${data.orderId}`)
    return {
      orderId: data.orderId,
      productId: data.productId,
      removed: true,
    }
  },
})

// Cart
export const cartGet = pikkuSessionlessFunc<
  { customerId: string },
  {
    customerId: string
    items: Array<{ productId: string; quantity: number; price: number }>
    total: number
  }
>({
  title: 'Get Cart',
  func: async ({ logger }, data) => {
    logger.info(`Getting cart for customer: ${data.customerId}`)
    return {
      customerId: data.customerId,
      items: [
        { productId: 'prod-1', quantity: 2, price: 29.99 },
        { productId: 'prod-2', quantity: 1, price: 49.99 },
      ],
      total: 109.97,
    }
  },
})

export const cartCheckout = pikkuSessionlessFunc<
  { customerId: string; shippingAddress: string; paymentMethodId: string },
  { orderId: string; status: string; total: number; createdAt: string }
>({
  title: 'Checkout Cart',
  func: async ({ logger }, data) => {
    logger.info(`Checking out cart for customer: ${data.customerId}`)
    return {
      orderId: `order-${Date.now()}`,
      status: 'pending_payment',
      total: 109.97,
      createdAt: new Date().toISOString(),
    }
  },
})

// Shipping
export const shipmentCreate = pikkuSessionlessFunc<
  { orderId: string; carrier: string; trackingNumber?: string },
  {
    id: string
    orderId: string
    carrier: string
    trackingNumber: string
    status: string
    createdAt: string
  }
>({
  title: 'Create Shipment',
  func: async ({ logger }, data) => {
    logger.info(`Creating shipment for order: ${data.orderId}`)
    return {
      id: `shipment-${Date.now()}`,
      orderId: data.orderId,
      carrier: data.carrier,
      trackingNumber: data.trackingNumber || `TRK${Date.now()}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
  },
})

export const shipmentUpdateStatus = pikkuSessionlessFunc<
  { shipmentId: string; status: string },
  { id: string; status: string; updatedAt: string }
>({
  title: 'Update Shipment Status',
  func: async ({ logger }, data) => {
    logger.info(
      `Updating shipment ${data.shipmentId} status to: ${data.status}`
    )
    return {
      id: data.shipmentId,
      status: data.status,
      updatedAt: new Date().toISOString(),
    }
  },
})
