import { UserSessionService } from './services/user-session-service.js'
import {
  CoreSingletonServices,
  PikkuInteraction,
  PikkuMiddleware,
} from './types/core.types.js'

/**
 * Runs a chain of middleware functions in sequence before executing the main function.
 *
 * @param services - An object containing services (e.g., singletonServices, userSessionService, etc.)
 * @param interaction - The interaction context, e.g., { http }.
 * @param middlewares - An array of middleware functions to run.
 * @param main - The main function to execute after all middleware have run.
 * @returns A promise resolving to the result of the main function.
 *
 * @example
 * runMiddleware(
 *   { ...services, userSessionService },
 *   { http },
 *   [middleware1, middleware2, middleware3],
 *   async () => { return await runMain(); }
 * );
 */
export const runMiddleware = async (
  services: CoreSingletonServices & {
    userSessionService: UserSessionService<any>
    context?: Map<string, unknown>
  },
  interaction: PikkuInteraction,
  middlewares: PikkuMiddleware[],
  main?: () => Promise<void>
): Promise<void> => {
  const dispatch = async (index: number): Promise<any> => {
    if (middlewares && index < middlewares.length) {
      await middlewares[index]!(services, interaction, () =>
        dispatch(index + 1)
      )
    } else if (main) {
      return await main()
    }
  }
  await dispatch(0)
}
