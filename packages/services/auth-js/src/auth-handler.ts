import { Auth } from '@auth/core'
import type { AuthConfig } from '@auth/core'
import type { CoreSingletonServices } from '@pikku/core'
import type { CorePikkuFunctionSessionless } from '@pikku/core/function'

import { toWebRequest } from '@pikku/core/http'

export type AuthConfigOrFactory =
  | AuthConfig
  | ((services: CoreSingletonServices) => AuthConfig | Promise<AuthConfig>)

/**
 * Creates a Pikku sessionless function that delegates to Auth.js.
 * Each Auth.js route (signin, callback, session, etc.) uses this handler.
 *
 * Returns a Web API Response directly, which the Pikku HTTP runner
 * applies via applyWebResponse — preserving status, headers, and body.
 */
export const createAuthHandler = (
  config: AuthConfigOrFactory
): { func: CorePikkuFunctionSessionless<any, any> } => ({
  func: async (services, _input, { http }) => {
    const request = http?.request
    if (!request) {
      return
    }

    const resolvedConfig =
      typeof config === 'function' ? await config(services) : config
    const webRequest = toWebRequest(request)
    return await Auth(webRequest, resolvedConfig)
  },
})
