import { pikkuMiddleware } from '#pikku/middleware'

export const loggingMiddleware = pikkuMiddleware(
  async (_services, _wire, next) => {
    await next()
  }
)
