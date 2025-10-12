import {
  pikkuMiddleware,
  pikkuMiddlewareFactory,
} from '../../.pikku/pikku-types.gen.js'
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
 * Middleware factory to log command execution timing and status
 *
 * The skipCondition can be:
 * - A boolean value
 * - A function that receives services and returns a boolean (can access getInspectorState)
 */
export const logCommandInfoAndTime =
  pikkuMiddlewareFactory<LogCommandInfoOptions>(
    ({
      commandStart,
      commandEnd,
      skipCondition = false,
      skipMessage = 'none found',
    }) => {
      return pikkuMiddleware(
        async ({ logger, ...services }, _interaction, next) => {
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
          logger.info({
            message: `✓ ${commandEnd} in ${Date.now() - start}ms.`,
            type: 'success',
          })
        }
      )
    }
  )
