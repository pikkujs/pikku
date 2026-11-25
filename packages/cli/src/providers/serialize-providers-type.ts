export interface ServiceTypeSource {
  /** The `defineProvider` const's exported name, for error text. */
  name: string
  /** Every key any variant of the service provides. */
  provides: readonly string[]
  /** The keys some variant returns only sometimes: optional in the merged type. */
  optionalProvides?: readonly string[]
  /** The import specifier of the module exporting the service, from the generated file. */
  specifier: string
  export: string
}

/** A `defineProviderCollection` const the project or an opted-in addon declares. */
export interface CollectionTypeSource {
  name: string
  specifier: string
  export: string
}

export interface SerializeSingletonServicesTypeOptions {
  /** `import type { X as BaseSingletonServices } from '...'`, written by the caller. */
  baseImport: string
  services: readonly ServiceTypeSource[]
  /** Each is a key of the merged type: the label-sorted entries its providers add. */
  collections?: readonly CollectionTypeSource[]
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
  collections = [],
}: SerializeSingletonServicesTypeOptions): string => {
  const keys = new Map<string, ServiceTypeSource>()
  const optionalKeys = new Set<string>()
  for (const service of services) {
    for (const key of service.provides) {
      if (!keys.has(key)) keys.set(key, service)
    }
    for (const key of service.optionalProvides ?? []) optionalKeys.add(key)
  }
  const collected = new Map(collections.map((c) => [c.name, c]))
  const provided = [...new Set([...keys.keys(), ...collected.keys()])].sort()

  const merged =
    provided.length === 0
      ? `export type SingletonServices = BaseSingletonServices`
      : [
          `export type SingletonServices = Omit<BaseSingletonServices, ${provided.map((key) => JSON.stringify(key)).join(' | ')}> & {`,
          ...provided.map((key) => {
            const collection = collected.get(key)
            if (collection) {
              return `  readonly ${JSON.stringify(key)}: CollectionEntries<typeof import(${JSON.stringify(collection.specifier)}).${collection.export}>`
            }
            return `  ${JSON.stringify(key)}${optionalKeys.has(key) ? '?' : ''}: Merged<${JSON.stringify(key)}, Provided<${typeOf(keys.get(key)!)}, ${JSON.stringify(key)}>>`
          }),
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

${
  collections.length === 0
    ? ''
    : `type CollectionEntries<Collection> =
  Collection extends ProviderCollection<string, infer Item>
    ? readonly ProviderCollectionEntry<Item>[]
    : never

`
}type Factory<Service> = Service extends (...args: never[]) => unknown
  ? Service
  : Service extends object
    ? Extract<
        Service[Exclude<keyof Service, 'optional' | 'replaces' | 'addTo' | 'onServerStart'>],
        (...args: never[]) => unknown
      >
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

/**
 * A key the project's own type declares keeps that type and gains what the
 * provider returns, so a provider that wraps or extends a core service still
 * satisfies what core expects of it.
 */
type Merged<Key extends string, Value> = Key extends keyof BaseSingletonServices
  ? IsAny<BaseSingletonServices[Key]> extends true
    ? Value
    : NonNullable<BaseSingletonServices[Key]> & Value
  : Value

`

  return `/**
 * Singleton services, with what every defineProvider provides
 */

import { defineProvider as coreProvider } from '@pikku/core/provider'
import type {
${collections.length === 0 ? '' : '  ProviderCollectionEntry,\n'}  ProviderCollection,
  ProviderFactory,
  ProviderVariants,
  WithOptional,
} from '@pikku/core/provider'
${baseImport}

export type {
  ProviderCollection,
  ProviderCollectionEntry,
} from '@pikku/core/provider'

${helpers}${merged}

/**
 * The keys other providers (and the project) inject into the services before
 * \`pikkuServices\` runs.
 */
export type InjectedServices = ${provided.length === 0 ? 'Record<never, never>' : `Pick<SingletonServices, ${provided.map((key) => JSON.stringify(key)).join(' | ')}>`}

type DefineProvider = {
  <
    TName extends string,
    TItem extends object,
    const TOptional extends keyof SingletonServices & string = never,
  >(
    variants: ProviderVariants<
      WithOptional<SingletonServices, TOptional>,
      TItem,
      TOptional
    > & { addTo: ProviderCollection<TName, TItem> }
  ): ProviderVariants<
    WithOptional<SingletonServices, TOptional>,
    TItem,
    TOptional
  >
  <TProvides extends object>(
    factory: ProviderFactory<SingletonServices, TProvides>
  ): ProviderFactory<SingletonServices, TProvides>
  <
    TProvides extends object,
    const TOptional extends keyof SingletonServices & string = never,
  >(
    variants: ProviderVariants<
      WithOptional<SingletonServices, TOptional>,
      TProvides,
      TOptional
    >
  ): ProviderVariants<
    WithOptional<SingletonServices, TOptional>,
    TProvides,
    TOptional
  >
}

/**
 * Declares a provider: a factory that destructures what it needs from
 * \`services\` and returns what it provides, the same on every target, or an
 * object with a \`dev\`, \`deploy\`, \`deploy:<profile>\` or \`common\` factory. A
 * target's own variant overrides \`common\`. Needs that may be absent are listed
 * in \`optional\`.
 */
export const defineProvider = coreProvider as unknown as DefineProvider
`
}
