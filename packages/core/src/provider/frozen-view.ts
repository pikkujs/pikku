import { ProviderError } from './provider-error.js'

/**
 * What a provider's factory receives as `services`: the declared needs that
 * are held, and nothing else. Reading any other name throws `undeclared-read`;
 * the view cannot be changed, and listing its keys shows only declared needs.
 */
export const frozenView = (
  services: Readonly<Record<string, unknown>>,
  declared: readonly string[],
  providerName: string
): Record<string, unknown> => {
  const allowed = new Set(declared)
  const view: Record<string, unknown> = Object.create(null)
  for (const name of allowed) {
    if (name in services && services[name] !== undefined) {
      view[name] = services[name]
    }
  }
  return new Proxy(Object.freeze(view), {
    get(target, property, receiver) {
      if (typeof property === 'string' && !allowed.has(property)) {
        throw new ProviderError(
          'undeclared-read',
          `Provider '${providerName}' read '${property}', which it does not destructure. Its needs are: ${declared.join(', ') || 'none'}.`
        )
      }
      return Reflect.get(target, property, receiver)
    },
  })
}
