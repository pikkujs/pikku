import { pikkuAddonServices } from '#pikku'
import { NoopService } from './services/noop-service.js'

export const createSingletonServices = pikkuAddonServices(
  async (_config, { greetingStore, auditSink }) => {
    void greetingStore
    void auditSink
    return {
      noop: new NoopService(),
    }
  }
)
