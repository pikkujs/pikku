import { pikkuMiddleware } from '#pikku/function'

export const loggingMiddleware = pikkuMiddleware(
  async (_services, _wire, next) => {
    await next()
  }
)
