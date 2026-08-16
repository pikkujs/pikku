import { pikkuMiddleware } from '@pikku/core/types'
import type { MiddlewarePriority } from '@pikku/core/types'

export const priorityMiddleware = (
  name: string,
  priority: MiddlewarePriority
) => {
  const middleware = pikkuMiddleware({
    name: `priority-${name}`,
    priority,
    func: async ({ logger }, _data, next) => {
      logger.info({ type: 'priority', name, phase: 'before' })
      const result = await next()
      logger.info({ type: 'priority', name, phase: 'after' })
      return result
    },
  })
  return middleware
}
