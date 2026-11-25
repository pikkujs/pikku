export interface ServiceTypeSource {
  /** The `defineProvider` const's exported name, for error text. */
  name: string
  /** Every key any variant of the service provides. */
  provides: readonly string[]
  /** The import specifier of the module exporting the service, from the generated file. */
  specifier: string
  export: string
}

export interface SerializeSingletonServicesTypeOptions {
  /** `import type { X as BaseSingletonServices } from '...'`, written by the caller. */
  baseImport: string
  services: readonly ServiceTypeSource[]
}

const typeOf = ({ specifier, export: exported }: ServiceTypeSource) =>
  exported === 'default'
    ? `typeof import(${JSON.stringify(specifier)}).default`
    : `typeof import(${JSON.stringify(specifier)}).${exported}`

/**
 * Generates `#pikku/provider`: this project's `SingletonServices`, which is the
 * type the project declared plus what each `defineProvider` provides, and the
 * `defineProvider` helper typed against it.
 *
 * What a service provides is read back from its factory's return type, so a
 * service cannot also be written down here: each key is a required property
 * whose type is looked up in the service itself. A key a service provides
 * replaces the one in the project's type. A key that comes out `any` is made a
 * visible error type, never a silent `any`.
 *
 * The properties are literal and their types resolved lazily, so a service can
 * destructure the keys of another from this type without the two depending on
 * each other's inferred types.
 */
export const serializeProvidersType = ({
  baseImport,
  services,
}: SerializeSingletonServicesTypeOptions): string => {
  const keys = new Map<string, ServiceTypeSource>()
  for (const service of services) {
    for (const key of service.provides) {
      if (!keys.has(key)) keys.set(key, service)
    }
  }
  const provided = [...keys.keys()].sort()

  const merged =
    provided.length === 0
      ? `export type SingletonServices = BaseSingletonServices`
      : [
          `export type SingletonServices = Omit<BaseSingletonServices, ${provided.map((key) => JSON.stringify(key)).join(' | ')}> & {`,
          ...provided.map(
            (key) =>
              `  ${JSON.stringify(key)}: Provided<${typeOf(keys.get(key)!)}, ${JSON.stringify(key)}>`
          ),
          `}`,
        ].join('\n')

  const helpers =
    provided.length === 0
      ? ''
      : `type IsAny<T> = 0 extends 1 & T ? true : false

/** What a service provides under a key that resolved to \`any\`. */
export type ProviderKeyIsAny<Key extends string> = {
  readonly providerKeyIsAny: Key
}

type Factory<Service> = Service extends (...args: never[]) => unknown
  ? Service
  : Service extends { dev?: infer D; deploy?: infer P; common?: infer C }
    ? Extract<D | P | C, (...args: never[]) => unknown>
    : never

type Built<Service> =
  Factory<Service> extends (...args: never[]) => infer R ? Awaited<R> : never

type Provided<Service, Key extends string> =
  Built<Service> extends infer B
    ? B extends Record<Key, infer V>
      ? IsAny<V> extends true
        ? ProviderKeyIsAny<Key>
        : V
      : never
    : never

`

  return `/**
 * Singleton services, with what every defineProvider provides
 */

import { defineProvider as coreProvider } from '@pikku/core/provider'
import type {
  ProviderFactory,
  ProviderVariants,
} from '@pikku/core/provider'
${baseImport}

${helpers}${merged}

/**
 * Declares a service: a factory that destructures what it needs from
 * \`services\` and returns what it provides, the same on every target, or an
 * object with a \`dev\`, \`deploy\` or \`common\` factory. A target's own variant
 * overrides \`common\`.
 */
export const defineProvider: {
  <TProvides extends object>(
    factory: ProviderFactory<SingletonServices, TProvides>
  ): ProviderFactory<SingletonServices, TProvides>
  <TProvides extends object>(
    variants: ProviderVariants<SingletonServices, TProvides>
  ): ProviderVariants<SingletonServices, TProvides>
} = coreProvider
`
}
