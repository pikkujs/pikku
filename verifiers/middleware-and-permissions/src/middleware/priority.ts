import { pikkuMiddleware } from '@pikku/core'
import type { MiddlewarePriority } from '@pikku/core'

export const priorityMiddleware = (
  name: string,
  priority: MiddlewarePriority
) =>
  pikkuMiddleware({
    name: `priority-${name}`,
    priority,
    func: async ({ logger }, _data, next) => {
      logger.info({ type: 'priority', name, phase: 'before' })
      const result = await next()
      logger.info({ type: 'priority', name, phase: 'after' })
      return result
    },
  })
