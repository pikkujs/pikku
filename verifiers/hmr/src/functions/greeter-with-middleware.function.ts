import { pikkuSessionlessFunc } from '#pikku'
import { loggingMiddleware } from './middleware.js'

export const greeterWithMiddleware = pikkuSessionlessFunc<
  { name: string },
  { message: string }
>({
  auth: false,
  func: async (_services, { name }) => {
    return { message: `Middleware Hello, ${name}!` }
  },
  middleware: [loggingMiddleware],
})
