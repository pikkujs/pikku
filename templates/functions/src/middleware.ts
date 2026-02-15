import { authBearer } from '@pikku/core/middleware'
import type { AIStreamEvent } from '@pikku/core/ai-agent'
import {
  addHTTPMiddleware,
  pikkuChannelMiddleware,
} from '../.pikku/pikku-types.gen.js'

export const httpAuthMiddleware = () => addHTTPMiddleware('*', [authBearer({})])

export const appendModified = pikkuChannelMiddleware<any, AIStreamEvent>(
  async (_services, event, next) => {
    if (event.type === 'text-delta') {
      await next({ ...event, text: event.text + ' - modified' })
    } else {
      await next(event)
    }
  }
)
