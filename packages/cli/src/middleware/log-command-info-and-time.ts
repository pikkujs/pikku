import type { Services } from '../../types/application-types.js'
import type { PikkuWire } from '@pikku/core'

// Middleware type for CLI
type PikkuMiddleware = (
  services: Services,
  wire: PikkuWire,
  next: () => Promise<void>
) => Promise<void>

export interface LogCommandInfoOptions {
  commandStart: string
  commandEnd: string
}

/**
 * Middleware to log command execution timing and status
 * Uses debug level so it only shows with --verbose flag
 */
export const logCommandInfoAndTime = ({
  commandStart,
  commandEnd,
}: LogCommandInfoOptions): PikkuMiddleware => {
  return async ({ logger }, _wire, next) => {
    const start = Date.now()
    logger.debug(`• ${commandStart}...`)

    await next()

    logger.debug({
      type: 'success',
      message: `✓ ${commandEnd} in ${Date.now() - start}ms.`,
    })
  }
}
