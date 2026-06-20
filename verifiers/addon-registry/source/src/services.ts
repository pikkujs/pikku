import { pikkuAddonServices } from '#pikku'
import { NoopService } from './services/noop-service.js'

export const createSingletonServices = pikkuAddonServices(
  async (_config, _services) => {
    return {
      noop: new NoopService(),
    }
  }
)
