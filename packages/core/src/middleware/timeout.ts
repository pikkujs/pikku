import { RequestTimeoutError } from '../errors/errors.js'
import { CorePikkuMiddleware } from '../types/core.types.js'

export const timeout = (timeout: number) => {
  const middleware: CorePikkuMiddleware = async (
    _services,
    _interaction,
    next
  ) => {
    setTimeout(() => {
      throw new RequestTimeoutError()
    }, timeout)

    await next()
  }
  return middleware
}
