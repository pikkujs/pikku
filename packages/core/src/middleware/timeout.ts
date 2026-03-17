import { RequestTimeoutError } from '../errors/errors.js'
import { pikkuMiddleware, pikkuMiddlewareFactory } from '../types/core.types.js'

export const timeout = () =>
  pikkuMiddlewareFactory<{ timeout: number }>(({ timeout }) =>
    pikkuMiddleware(async (_services, _wire, next) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        next(),
        new Promise<never>((_resolve, reject) => {
          timeoutId = setTimeout(
            () => reject(new RequestTimeoutError()),
            timeout
          )
        }),
      ]).finally(() => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId)
        }
      })
    })
  )
