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

/**
 * Turns a better-auth instance, or a `pikkuBetterAuth` factory plus the app's
 * `createConfig`/`createSingletonServices`, into a getter that resolves the
 * instance. A factory's services and instance are built on first call and
 * shared after it; a failed build is retried on the next call.
 *
 * @throws When given a factory without `createSingletonServices`.
 * @example snippet: betterAuthServerSession
 */
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

type FactoryGetter = () => Promise<BetterAuthInstance>

/** Stands in for an omitted `createConfig`, which a `WeakMap` cannot key on. */
const NO_CONFIG = {}

/**
 * One getter per (factory, createSingletonServices, createConfig), so calling
 * {@link getAuthSession} with a factory on every request builds the singleton
 * services — database pools included — and the better-auth instance once,
 * rather than once per call.
 *
 * Weak at every level: a builder the caller no longer holds, such as a closure
 * written inline in a route handler, is not kept alive here along with the
 * services its getter built.
 */
const factoryGetters = new WeakMap<
  object,
  WeakMap<object, WeakMap<object, FactoryGetter>>
>()

const cachedFactoryGetter = <
  I extends BetterAuthInstance,
  C extends CoreConfig,
  S extends CoreSingletonServices<C>,
>(
  auth: PikkuBetterAuthFactory<I, S>,
  createConfig: CreateConfig<C> | undefined,
  createSingletonServices: (config: C) => Promise<S>
): (() => Promise<I>) => {
  let byServices = factoryGetters.get(auth)
  if (!byServices) {
    byServices = new WeakMap()
    factoryGetters.set(auth, byServices)
  }
  let byConfig = byServices.get(createSingletonServices)
  if (!byConfig) {
    byConfig = new WeakMap()
    byServices.set(createSingletonServices, byConfig)
  }
  const configKey = createConfig ?? NO_CONFIG
  const found = byConfig.get(configKey)
  if (found) {
    return found as () => Promise<I>
  }
  const getter = createResolvedAuthGetter<I, C, S>(
    auth,
    createConfig,
    createSingletonServices
  )
  byConfig.set(configKey, getter)
  return getter
}

/**
 * Reads the better-auth session for a request outside a pikku function — a
 * Next.js route handler, a TanStack Start loader. Relayed cross-site cookies are
 * merged in first, on a copy of the headers.
 *
 * Given a factory, the singleton services and the instance are built once per
 * (factory, createConfig, createSingletonServices) and reused across calls.
 *
 * @example snippet: betterAuthServerSession
 */
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
