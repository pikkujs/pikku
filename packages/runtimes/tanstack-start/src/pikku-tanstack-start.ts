import type {
  CoreConfig,
  CoreSingletonServices,
  CreateConfig,
} from '@pikku/core'
import {
  createResolvedAuthGetter,
  type BetterAuthInstance,
  type PikkuBetterAuthFactory,
} from '@pikku/better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

export { tanstackStartCookies }

export type TanStackStartAuthContext = {
  request: Request
}

type BetterAuthRequestHandlerInput =
  | Pick<BetterAuthInstance, 'handler'>
  | ((request: Request) => Promise<Response>)

const toRequestHandler = (
  auth: BetterAuthRequestHandlerInput
): ((request: Request) => Promise<Response>) => {
  return typeof auth === 'function'
    ? auth
    : async (request: Request) => await auth.handler(request)
}

export function toTanStackStartAuthHandler(
  auth: BetterAuthRequestHandlerInput
): (context: TanStackStartAuthContext) => Promise<Response>
export function toTanStackStartAuthHandler<
  I extends BetterAuthInstance,
  S extends CoreSingletonServices = CoreSingletonServices,
>(
  auth: PikkuBetterAuthFactory<I, S>,
  createConfig: CreateConfig<CoreConfig> | undefined,
  createSingletonServices: (config: CoreConfig) => Promise<S>
): (context: TanStackStartAuthContext) => Promise<Response>
export function toTanStackStartAuthHandler<
  I extends BetterAuthInstance,
  S extends CoreSingletonServices = CoreSingletonServices,
>(
  auth: BetterAuthRequestHandlerInput | PikkuBetterAuthFactory<I, S>,
  createConfig?: CreateConfig<CoreConfig>,
  createSingletonServices?: (config: CoreConfig) => Promise<S>
): (context: TanStackStartAuthContext) => Promise<Response> {
  if (createSingletonServices) {
    const getAuth = createResolvedAuthGetter(
      auth as PikkuBetterAuthFactory<I, S>,
      createConfig,
      createSingletonServices
    )
    return async ({ request }: TanStackStartAuthContext) => {
      return await (await getAuth()).handler(request)
    }
  }

  const handler = toRequestHandler(auth as BetterAuthRequestHandlerInput)
  return async ({ request }: TanStackStartAuthContext) => {
    return await handler(request)
  }
}
