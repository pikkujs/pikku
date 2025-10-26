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
 * Replaces the logCommandInfoAndTime wrapper function
 */
export const logCommandInfoAndTime = ({
  commandStart,
  commandEnd,
}: LogCommandInfoOptions): PikkuMiddleware => {
  return async ({ logger }, _interaction, next) => {
    // Log start
    const start = Date.now()
    logger.info(`• ${commandStart}...`)

    // Execute the function
    await next()

    // Log completion
    logger.info(`✓ ${commandEnd} in ${Date.now() - start}ms.`)
  }
}
