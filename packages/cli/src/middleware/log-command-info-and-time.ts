import type { Services } from '../../types/application-types.js'
import type { PikkuInteraction } from '@pikku/core'

// Middleware type for CLI
type PikkuMiddleware = (
  services: Services,
  interaction: PikkuInteraction,
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
  return async ({ logger }, _interaction, next) => {
    // Log start (debug level - only shows with --verbose)
    const start = Date.now()
    logger.debug(`• ${commandStart}...`)

    // Execute the function
    await next()

    // Log completion (debug level - only shows with --verbose)
    logger.debug({
      type: 'success',
      message: `✓ ${commandEnd} in ${Date.now() - start}ms.`,
    })
  }
}
