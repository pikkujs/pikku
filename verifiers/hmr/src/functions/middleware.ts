import { pikkuMiddleware } from '#pikku'

export const loggingMiddleware = pikkuMiddleware(
  async (_services, _wire, next) => {
    await next()
  }
)
