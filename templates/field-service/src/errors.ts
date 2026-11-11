import { addError } from '#pikku/error'

export class WrongCompanyError extends Error {}

addError(WrongCompanyError, {
  status: 404,
  message: 'No such record',
})

export class QuoteAlreadyDecidedError extends Error {}

addError(QuoteAlreadyDecidedError, {
  status: 409,
  message: 'That quote has already been decided',
})
