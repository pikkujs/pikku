import type { SecretlessServices } from '../types/core.types.js'

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
