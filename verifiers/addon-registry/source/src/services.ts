import { pikkuAddonServices } from '#pikku/addon'
import { NoopService } from './services/noop-service.js'

export const createSingletonServices = pikkuAddonServices(
  async (_config, _services) => {
    return {
      noop: new NoopService(),
    }
  }
)
