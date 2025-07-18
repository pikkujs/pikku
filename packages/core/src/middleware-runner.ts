import { UserSessionService } from './services/user-session-service.js'
import {
  CoreSingletonServices,
  PikkuFunctionMiddleware,
  PikkuInteraction,
  PikkuMiddleware,
} from './types/core.types.js'

/**
 * Runs a chain of middleware functions in sequence before executing the main function.
 *
 * @param services - An object containing services (e.g., singletonServices, userSession, etc.)
 * @param interaction - The interaction context, e.g., { http }.
 * @param middlewares - An array of middleware functions to run.
 * @param main - The main function to execute after all middleware have run.
 * @returns A promise resolving to the result of the main function.
 *
 * @example
 * runMiddleware(
 *   { ...services, userSession },
 *   { http },
 *   [middleware1, middleware2, middleware3],
 *   async () => { return await runMain(); }
 * );
 */
export const runMiddleware = async <
  Middleware extends
    | PikkuMiddleware
    | PikkuFunctionMiddleware = PikkuMiddleware,
>(
  services: CoreSingletonServices & {
    userSession?: UserSessionService<any>
  },
  interaction: PikkuInteraction,
  middlewares: Middleware[],
  main?: () => Promise<unknown>
): Promise<unknown> => {
  let result: any
  const dispatch = async (index: number): Promise<any> => {
    if (middlewares && index < middlewares.length) {
      return await middlewares[index]!(services as any, interaction, () =>
        dispatch(index + 1)
      )
    } else if (main) {
      result = await main()
    }
  }
  await dispatch(0)
  return result
}
