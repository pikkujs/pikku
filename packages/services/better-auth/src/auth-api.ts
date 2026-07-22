import type {
  CoreConfig,
  CoreSingletonServices,
  CreateConfig,
} from '@pikku/core'
import type {
  BetterAuthInstance,
  PikkuBetterAuthFactory,
} from './define-auth.js'

export const createResolvedAuthGetter = <
  I extends BetterAuthInstance,
  C extends CoreConfig = CoreConfig,
  S extends CoreSingletonServices<C> = CoreSingletonServices<C>,
>(
  auth: I | PikkuBetterAuthFactory<I, S>,
  createConfig?: CreateConfig<C>,
  createSingletonServices?: (config: C) => Promise<S>
): (() => Promise<I>) => {
  if (createSingletonServices) {
    let singletonServicesPromise: Promise<S> | undefined
    let authPromise: Promise<I> | undefined

    const getSingletonServices = async (): Promise<S> => {
      singletonServicesPromise ??= (async () => {
        const config = createConfig ? await createConfig() : ({} as C)
        return await createSingletonServices(config)
      })().catch((error) => {
        singletonServicesPromise = undefined
        throw error
      })

      return singletonServicesPromise
    }

    return async () => {
      authPromise ??= (async () => {
        const services = await getSingletonServices()
        return await (auth as PikkuBetterAuthFactory<I, S>)(services)
      })().catch((error) => {
        authPromise = undefined
        throw error
      })

      return await authPromise
    }
  }

  if (createConfig) {
    throw new Error(
      'createSingletonServices is required when using a Pikku Better Auth factory'
    )
  }

  if (typeof auth === 'function') {
    throw new Error(
      'createSingletonServices is required when using a Pikku Better Auth factory'
    )
  }

  return async () => auth as I
}

export function getAuthSession<I extends BetterAuthInstance>(
  auth: I,
  request: Request | Headers
): Promise<Awaited<ReturnType<I['api']['getSession']>>>
export function getAuthSession<
  I extends BetterAuthInstance,
  C extends CoreConfig = CoreConfig,
  S extends CoreSingletonServices<C> = CoreSingletonServices<C>,
>(
  auth: PikkuBetterAuthFactory<I, S>,
  request: Request | Headers,
  createConfig: CreateConfig<C> | undefined,
  createSingletonServices: (config: C) => Promise<S>
): Promise<Awaited<ReturnType<I['api']['getSession']>>>
export async function getAuthSession<
  I extends BetterAuthInstance,
  C extends CoreConfig = CoreConfig,
  S extends CoreSingletonServices<C> = CoreSingletonServices<C>,
>(
  auth: I | PikkuBetterAuthFactory<I, S>,
  request: Request | Headers,
  createConfig?: CreateConfig<C>,
  createSingletonServices?: (config: C) => Promise<S>
): Promise<Awaited<ReturnType<I['api']['getSession']>>> {
  const instance = await createResolvedAuthGetter<I, C, S>(
    auth,
    createConfig,
    createSingletonServices
  )()

  const headers =
    request instanceof Headers ? request : new Headers(request.headers)
  return await instance.api.getSession({ headers })
}
