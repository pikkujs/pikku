import { PikkuMiddleware } from '@pikku/core'
import type { SingletonServices } from '../../types/application-types.js'

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
 * - A boolean value
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
    logger.success(`✓ ${commandEnd} in ${Date.now() - start}ms.`)
  }
}
