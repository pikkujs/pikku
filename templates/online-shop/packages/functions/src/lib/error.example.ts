import { z } from 'zod'
import {
  MissingServiceError,
  NotFoundError,
  ForbiddenError,
  PikkuError,
  addError,
  isExpectedError,
} from '@pikku/core/errors'
import { pikkuFunc } from '#pikku/function'

// @snippet start missingServiceError
export const requireJwt = (jwt: unknown) => {
  if (!jwt) {
    throw new MissingServiceError('JWT service is required')
  }
}
// @snippet end missingServiceError

// @snippet start isExpectedError
export const expectedChecks = [
  isExpectedError(new NotFoundError()), // true
  isExpectedError(new TypeError('x is undefined')), // false
]
// @snippet end isExpectedError

// @snippet start errorUsage
export const getOwnOrder = pikkuFunc({
  input: z.object({ orderId: z.string() }),
  func: async ({ kysely }, { orderId }, { session }) => {
    // Fetch the order
    const order = await kysely
      .selectFrom('order')
      .selectAll()
      .where('orderId', '=', orderId)
      .executeTakeFirst()
    if (!order) {
      throw new NotFoundError()
    }

    // Check permissions
    if (order.userId !== session.userId) {
      throw new ForbiddenError()
    }

    return order
  },
  title: 'Get one of your own orders',
  tags: ['orders'],
})
// @snippet end errorUsage

// @snippet start addError
export class OrderLimitExceededError extends PikkuError {}
export class InvalidSkuError extends PikkuError {}
export class OutOfStockError extends PikkuError {}

addError(OrderLimitExceededError, {
  status: 400,
  message: 'You have reached your open order limit',
})

addError(InvalidSkuError, {
  status: 400,
  message: 'The provided SKU is not valid',
})

addError(OutOfStockError, {
  status: 409,
  message: 'This item is currently out of stock',
})
// @snippet end addError

// @snippet start customErrorUsage
export const reserveItem = pikkuFunc({
  input: z.object({ itemId: z.string() }),
  func: async ({ kysely }, { itemId }, { session }) => {
    // Check the user's open order limit
    const open = await kysely
      .selectFrom('order')
      .select(kysely.fn.countAll<number>().as('n'))
      .where('userId', '=', session.userId)
      .where('status', '=', 'pending')
      .executeTakeFirstOrThrow()

    if (open.n >= 5) {
      throw new OrderLimitExceededError()
    }

    // Check stock
    const item = await kysely
      .selectFrom('item')
      .select('stock')
      .where('itemId', '=', itemId)
      .executeTakeFirstOrThrow()
    if (item.stock === 0) {
      throw new OutOfStockError()
    }

    return { itemId, reserved: true }
  },
  title: 'Reserve an item',
  tags: ['items'],
})
// @snippet end customErrorUsage

// @snippet start errorMessages
export const errorMessages = (openOrders: number) => {
  // Use default message
  const byDefault = new NotFoundError()

  // Custom message
  const custom = new NotFoundError('Item with this SKU does not exist')

  // With additional context
  const withContext = new OrderLimitExceededError()
  withContext.message = `You have ${openOrders} open orders. Maximum is 5.`

  return [byDefault, custom, withContext]
}
// @snippet end errorMessages

// @snippet start extendPikkuError
export class PaymentDeclinedError extends PikkuError {}
// @snippet end extendPikkuError
