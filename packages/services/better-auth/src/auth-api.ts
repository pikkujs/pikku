import type {
  CoreConfig,
  CoreSingletonServices,
  CreateConfig,
} from '@pikku/core/types'
import type {
  BetterAuthInstance,
  PikkuBetterAuthFactory,
} from './define-auth.js'
import { mergeRelayedCookies } from './cross-site-cookies.js'

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

type FactoryGetterEntry = {
  createConfig: unknown
  createSingletonServices: unknown
  getter: () => Promise<BetterAuthInstance>
}

/**
 * One getter per (factory, createConfig, createSingletonServices), so calling
 * {@link getAuthSession} with a factory on every request builds the singleton
 * services — database pools included — and the better-auth instance once,
 * rather than once per call.
 */
const factoryGetters = new WeakMap<object, FactoryGetterEntry[]>()

const cachedFactoryGetter = <
  I extends BetterAuthInstance,
  C extends CoreConfig,
  S extends CoreSingletonServices<C>,
>(
  auth: PikkuBetterAuthFactory<I, S>,
  createConfig: CreateConfig<C> | undefined,
  createSingletonServices: (config: C) => Promise<S>
): (() => Promise<I>) => {
  const entries = factoryGetters.get(auth) ?? []
  factoryGetters.set(auth, entries)
  const found = entries.find(
    (entry) =>
      entry.createConfig === createConfig &&
      entry.createSingletonServices === createSingletonServices
  )
  if (found) {
    return found.getter as () => Promise<I>
  }
  const getter = createResolvedAuthGetter<I, C, S>(
    auth,
    createConfig,
    createSingletonServices
  )
  entries.push({ createConfig, createSingletonServices, getter })
  return getter
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
  const instance =
    typeof auth === 'function' && createSingletonServices
      ? await cachedFactoryGetter<I, C, S>(
          auth,
          createConfig,
          createSingletonServices
        )()
      : await createResolvedAuthGetter<I, C, S>(
          auth,
          createConfig,
          createSingletonServices
        )()

  // Copy even when handed a Headers: mergeRelayedCookies mutates its argument,
  // and that one belongs to the caller.
  const headers = mergeRelayedCookies(
    new Headers(request instanceof Headers ? request : request.headers)
  )
  return await instance.api.getSession({ headers })
}
