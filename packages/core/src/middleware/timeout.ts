import { RequestTimeoutError } from '../errors/errors.js'
import { PikkuMiddleware } from '../types/core.types.js'

export const timeout = (timeout: number) => {
  const middleware: PikkuMiddleware = async (_services, _interaction, next) => {
    setTimeout(() => {
      throw new RequestTimeoutError()
    }, timeout)

    await next()
  }
  return middleware
}
