import { pikkuAddonServices } from '#pikku'
import { NoopService } from './services/noop-service.js'

export const createSingletonServices = pikkuAddonServices(
  async (_config, { greetingStore, auditSink }) => {
    // Destructuring declares requiredParentServices for consumers; the noop
    // construction here stands in for addon services that depend on them.
    void greetingStore
    void auditSink
    return {
      noop: new NoopService(),
    }
  }
)
