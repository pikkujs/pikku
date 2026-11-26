import { ConsoleLogger } from '@pikku/core/services'
import { pikkuService } from '@pikku/core/pikku-service'

// ConsoleLogger keeps its own private `prefix`; the checks read the public one
// set here, so the value is typed as the logger it still is.
const prefixed = (prefix: string): { logger: ConsoleLogger } => ({
  logger: Object.assign(new ConsoleLogger(), {
    prefix,
  }) as unknown as ConsoleLogger,
})

/**
 * Replaces the baseline `logger` the host already holds, which is allowed for
 * exactly one service. It cannot also need `logger`: a service that provides
 * what it needs depends on itself.
 */
export const loggerPrefix = pikkuService({
  dev: () => prefixed('dev'),
  deploy: () => prefixed('deploy'),
})
