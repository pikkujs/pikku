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
  S extends CoreSingletonServices = CoreSingletonServices,
>(
  auth: I | PikkuBetterAuthFactory<I, S>,
  createConfig?: CreateConfig<CoreConfig>,
  createSingletonServices?: (config: CoreConfig) => Promise<S>
): (() => Promise<I>) => {
  if (createSingletonServices) {
    let singletonServicesPromise: Promise<S> | undefined
    let authPromise: Promise<I> | undefined

    const getSingletonServices = async (): Promise<S> => {
      singletonServicesPromise ??= (async () => {
        const config = createConfig ? await createConfig() : ({} as CoreConfig)
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

  return async () => auth as I
}

export function getAuthSession<I extends BetterAuthInstance>(
  auth: I,
  request: Request | Headers
): Promise<Awaited<ReturnType<I['api']['getSession']>>>
export function getAuthSession<
  I extends BetterAuthInstance,
  S extends CoreSingletonServices = CoreSingletonServices,
>(
  auth: PikkuBetterAuthFactory<I, S>,
  request: Request | Headers,
  createConfig: CreateConfig<CoreConfig> | undefined,
  createSingletonServices: (config: CoreConfig) => Promise<S>
): Promise<Awaited<ReturnType<I['api']['getSession']>>>
export async function getAuthSession<
  I extends BetterAuthInstance,
  S extends CoreSingletonServices = CoreSingletonServices,
>(
  auth: I | PikkuBetterAuthFactory<I, S>,
  request: Request | Headers,
  createConfig?: CreateConfig<CoreConfig>,
  createSingletonServices?: (config: CoreConfig) => Promise<S>
): Promise<Awaited<ReturnType<I['api']['getSession']>>> {
  const instance = await createResolvedAuthGetter(
    auth,
    createConfig,
    createSingletonServices
  )()

  const headers = request instanceof Headers ? request : new Headers(request.headers)
  return await instance.api.getSession({ headers })
}
