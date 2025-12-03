/**
 * Inventory Management Functions
 * Mock implementations for stock management
 */

import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'

export const inventoryCheck = pikkuSessionlessFunc<
  { productId: string },
  { productId: string; available: number; reserved: number; inStock: boolean }
>({
  title: 'Check Inventory',
  func: async ({ logger }, data) => {
    logger.info(`Checking inventory for product: ${data.productId}`)
    return {
      productId: data.productId,
      available: 100,
      reserved: 10,
      inStock: true,
    }
  },
})

export const inventoryReserve = pikkuSessionlessFunc<
  { productId: string; quantity: number; orderId: string },
  {
    productId: string
    quantity: number
    orderId: string
    reservationId: string
    reserved: boolean
  }
>({
  title: 'Reserve Inventory',
  func: async ({ logger }, data) => {
    logger.info(
      `Reserving ${data.quantity} of product: ${data.productId} for order: ${data.orderId}`
    )
    return {
      productId: data.productId,
      quantity: data.quantity,
      orderId: data.orderId,
      reservationId: `res-${Date.now()}`,
      reserved: true,
    }
  },
})

export const inventoryRelease = pikkuSessionlessFunc<
  { reservationId: string },
  { reservationId: string; released: boolean; releasedAt: string }
>({
  title: 'Release Inventory',
  func: async ({ logger }, data) => {
    logger.info(`Releasing reservation: ${data.reservationId}`)
    return {
      reservationId: data.reservationId,
      released: true,
      releasedAt: new Date().toISOString(),
    }
  },
})

export const inventoryCheckLow = pikkuSessionlessFunc<
  { threshold?: number },
  {
    lowStockItems: Array<{
      productId: string
      productName: string
      available: number
      threshold: number
    }>
  }
>({
  title: 'Check Low Inventory',
  func: async ({ logger }, data) => {
    const threshold = data.threshold || 10
    logger.info(`Checking for low stock items (threshold: ${threshold})`)
    return {
      lowStockItems: [
        {
          productId: 'prod-5',
          productName: 'Widget A',
          available: 5,
          threshold,
        },
        {
          productId: 'prod-8',
          productName: 'Gadget B',
          available: 3,
          threshold,
        },
        {
          productId: 'prod-12',
          productName: 'Tool C',
          available: 8,
          threshold,
        },
      ],
    }
  },
})

export const inventoryRestock = pikkuSessionlessFunc<
  { productId: string; quantity: number; supplierId?: string },
  {
    productId: string
    quantity: number
    newAvailable: number
    restockedAt: string
  }
>({
  title: 'Restock Inventory',
  func: async ({ logger }, data) => {
    logger.info(
      `Restocking product: ${data.productId} with quantity: ${data.quantity}`
    )
    return {
      productId: data.productId,
      quantity: data.quantity,
      newAvailable: 100 + data.quantity,
      restockedAt: new Date().toISOString(),
    }
  },
})

export const inventoryUpdate = pikkuSessionlessFunc<
  {
    productId: string
    quantity: number
    operation: 'add' | 'subtract' | 'set'
  },
  {
    productId: string
    previousQuantity: number
    newQuantity: number
    updatedAt: string
  }
>({
  title: 'Update Inventory',
  func: async ({ logger }, data) => {
    logger.info(
      `Updating inventory for product: ${data.productId}, operation: ${data.operation}`
    )
    const previousQuantity = 100
    let newQuantity = previousQuantity
    if (data.operation === 'add') {
      newQuantity = previousQuantity + data.quantity
    } else if (data.operation === 'subtract') {
      newQuantity = previousQuantity - data.quantity
    } else {
      newQuantity = data.quantity
    }
    return {
      productId: data.productId,
      previousQuantity,
      newQuantity,
      updatedAt: new Date().toISOString(),
    }
  },
})

export const inventoryGetHistory = pikkuSessionlessFunc<
  { productId: string; limit?: number },
  {
    history: Array<{
      timestamp: string
      operation: string
      quantity: number
      orderId?: string
    }>
  }
>({
  title: 'Get Inventory History',
  func: async ({ logger }, data) => {
    logger.info(`Getting inventory history for product: ${data.productId}`)
    return {
      history: [
        {
          timestamp: new Date().toISOString(),
          operation: 'reserve',
          quantity: 5,
          orderId: 'order-1',
        },
        {
          timestamp: new Date().toISOString(),
          operation: 'restock',
          quantity: 50,
        },
        {
          timestamp: new Date().toISOString(),
          operation: 'reserve',
          quantity: 10,
          orderId: 'order-2',
        },
      ],
    }
  },
})

export const purchaseOrderCreate = pikkuSessionlessFunc<
  { supplierId: string; items: Array<{ productId: string; quantity: number }> },
  {
    id: string
    supplierId: string
    items: Array<{ productId: string; quantity: number }>
    status: string
    createdAt: string
  }
>({
  title: 'Create Purchase Order',
  func: async ({ logger }, data) => {
    logger.info(`Creating purchase order for supplier: ${data.supplierId}`)
    return {
      id: `po-${Date.now()}`,
      supplierId: data.supplierId,
      items: data.items,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
  },
})
