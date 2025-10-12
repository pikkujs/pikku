import type {
  SingletonServices,
  Services,
} from '../../types/application-types.js'
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
  skipCondition?:
    | boolean
    | ((services: SingletonServices) => boolean | Promise<boolean>)
  skipMessage?: string
}

/**
 * Middleware to log command execution timing and status
 * Replaces the logCommandInfoAndTime wrapper function
 *
 * The skipCondition can be:
 * - A boolean valuewe
 * - A function that receives services and returns a boolean (can access getInspectorState)
 */
export const logCommandInfoAndTime = ({
  commandStart,
  commandEnd,
  skipCondition = false,
  skipMessage = 'none found',
}: LogCommandInfoOptions): PikkuMiddleware => {
  return async ({ logger, ...services }, _interaction, next) => {
    // Evaluate skip condition (can be boolean or function)
    const shouldSkip =
      typeof skipCondition === 'function'
        ? await skipCondition({ logger, ...services } as any)
        : skipCondition

    if (shouldSkip === true) {
      logger.info(
        `• Skipping ${commandStart.charAt(0).toLocaleLowerCase()}${commandStart.slice(1)} since ${skipMessage}.`
      )
      return
    }

    // Log start
    const start = Date.now()
    logger.info(`• ${commandStart}...`)

    // Execute the function
    await next()

    // Log completion
    logger.info(`✓ ${commandEnd} in ${Date.now() - start}ms.`)
  }
}
