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
