import { addError } from '#pikku/error'

// @snippet start addError
export class OutOfStockError extends Error {}

addError(OutOfStockError, {
  status: 409,
  message: 'That item is out of stock',
})
// @snippet end addError
