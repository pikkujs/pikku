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
import {
  nextCookies,
  toNextJsHandler as betterAuthToNextJsHandler,
} from 'better-auth/next-js'

export { nextCookies }

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

export function toNextJsAuthHandler(
  auth: BetterAuthRequestHandlerInput
): ReturnType<typeof betterAuthToNextJsHandler>
export function toNextJsAuthHandler<
  I extends BetterAuthInstance,
  C extends CoreConfig = CoreConfig,
  S extends CoreSingletonServices<C> = CoreSingletonServices<C>,
>(
  auth: PikkuBetterAuthFactory<I, S>,
  createConfig: CreateConfig<C> | undefined,
  createSingletonServices: (config: C) => Promise<S>
): ReturnType<typeof betterAuthToNextJsHandler>
export function toNextJsAuthHandler<
  I extends BetterAuthInstance,
  C extends CoreConfig = CoreConfig,
  S extends CoreSingletonServices<C> = CoreSingletonServices<C>,
>(
  auth: BetterAuthRequestHandlerInput | PikkuBetterAuthFactory<I, S>,
  createConfig?: CreateConfig<C>,
  createSingletonServices?: (config: C) => Promise<S>
): ReturnType<typeof betterAuthToNextJsHandler> {
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
    return betterAuthToNextJsHandler(async (request: Request) => {
      return await (await getAuth()).handler(request)
    })
  }

  return betterAuthToNextJsHandler(
    toRequestHandler(auth as BetterAuthRequestHandlerInput)
  )
}
