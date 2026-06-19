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
  C extends CoreConfig = CoreConfig,
  S extends CoreSingletonServices<C> = CoreSingletonServices<C>,
>(
  auth: PikkuBetterAuthFactory<I, S>,
  createConfig: CreateConfig<C> | undefined,
  createSingletonServices: (config: C) => Promise<S>
): (context: TanStackStartAuthContext) => Promise<Response>
export function toTanStackStartAuthHandler<
  I extends BetterAuthInstance,
  C extends CoreConfig = CoreConfig,
  S extends CoreSingletonServices<C> = CoreSingletonServices<C>,
>(
  auth: BetterAuthRequestHandlerInput | PikkuBetterAuthFactory<I, S>,
  createConfig?: CreateConfig<C>,
  createSingletonServices?: (config: C) => Promise<S>
): (context: TanStackStartAuthContext) => Promise<Response> {
  if (createConfig && !createSingletonServices) {
    throw new Error(
      'createSingletonServices is required when using a Pikku Better Auth factory'
    )
  }

  if (createSingletonServices) {
    const getAuth = createResolvedAuthGetter<I, C, S>(
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
