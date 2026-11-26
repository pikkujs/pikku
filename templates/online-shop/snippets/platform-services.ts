// @snippet start platformServices
import { pikkuPlatformServices } from '@pikku/core/lifecycle'
import { LocalVariablesService } from '@pikku/core/services'

export const createPlatformServices = pikkuPlatformServices(
  (env, _services, { requiredServices }) =>
    requiredServices.includes('variables')
      ? { variables: new LocalVariablesService(env) }
      : {}
)
// @snippet end platformServices
