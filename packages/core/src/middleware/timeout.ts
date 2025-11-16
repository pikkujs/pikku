import { RequestTimeoutError } from '../errors/errors.js'
import { pikkuMiddleware, pikkuMiddlewareFactory } from '../types/core.types.js'

export const timeout = () =>
  pikkuMiddlewareFactory<{ timeout: number }>(({ timeout }) =>
    pikkuMiddleware(async (_services, _interaction, next) => {
      const timeoutId = setTimeout(() => {
        throw new RequestTimeoutError()
      }, timeout)

      await next()

      clearTimeout(timeoutId)
    })
  )
