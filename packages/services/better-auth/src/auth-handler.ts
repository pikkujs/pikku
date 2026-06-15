import type { CorePikkuFunctionSessionless } from '@pikku/core/function'
import { toWebRequest } from '@pikku/core/http'
import type { BetterAuthInstance } from './define-auth.js'

export const createAuthHandler = (): {
  func: CorePikkuFunctionSessionless<any, any>
} => ({
  func: async (services, _input, { http }) => {
    const request = http?.request
    if (!request) {
      return
    }
    const auth = (services as any).auth as BetterAuthInstance
    return await auth.handler(toWebRequest(request))
  },
})
