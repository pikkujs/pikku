import type { SecretlessServices } from '../types/core.types.js'

/**
 * Thrown when code that may not read secrets (a function body, a permission)
 * touches `services.secrets`. Secrets are read only in service factories and
 * middleware; give the service that needs a secret the value when you construct
 * it.
 */
export class SecretAccessDeniedError extends Error {
  constructor(context: string) {
    super(
      `'secrets' is not available inside ${context}. SecretService is confined to pikkuServices, pikkuWireServices, addon service factories and middleware — give a service the secret when you construct it and ask that service here.`
    )
    this.name = 'SecretAccessDeniedError'
  }
}

/** Returns `services` with `secrets` replaced by a throwing accessor. */
export const withoutSecrets = <T extends object>(
  services: T,
  context: string
): SecretlessServices<T> => {
  if (!('secrets' in services)) {
    return services as SecretlessServices<T>
  }
  const stripped = { ...services } as Record<string, unknown>
  Object.defineProperty(stripped, 'secrets', {
    get() {
      throw new SecretAccessDeniedError(context)
    },
    configurable: true,
    enumerable: false,
  })
  return stripped as SecretlessServices<T>
}

const viewsByServices = new WeakMap<object, Map<string, object>>()

/**
 * {@link withoutSecrets} for a long-lived services object, built once per
 * object and context. A view is a snapshot: only use it for singleton services,
 * never for an object assembled per invocation.
 *
 * knowledge: decisions/internals/a-secretless-view-of-the-singleton-services-is-built-once.md
 */
export const secretlessView = <T extends object>(
  services: T,
  context: string
): SecretlessServices<T> => {
  let byContext = viewsByServices.get(services)
  if (byContext === undefined) {
    byContext = new Map()
    viewsByServices.set(services, byContext)
  }
  let view = byContext.get(context)
  if (view === undefined) {
    view = withoutSecrets(services, context)
    // A pass-through (no `secrets` yet) is the services object itself: caching
    // it would keep handing out the raw object once `secrets` is attached.
    if (view !== services) byContext.set(context, view)
  }
  return view as SecretlessServices<T>
}
