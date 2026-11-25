import type { ProviderProfile, ProviderTarget } from '@pikku/core/provider'
import type { ResolvedProviderImport } from './resolve-providers.js'

export interface SerializeProviderRunnerOptions {
  target: ProviderTarget
  /** The deploy runtime the file is generated for, which picks a `deploy:<profile>` variant at run time. */
  profile?: ProviderProfile
  /** In run order, as `resolveProviders` returned them. */
  services: readonly ResolvedProviderImport[]
  /** The per-request providers, in the order a request builds them, as `resolveProviders` returned them. */
  wire?: readonly ResolvedProviderImport[]
  /** The collections the target holds, as `resolveProviders` returned them: each is a list a reader always finds. */
  collections?: readonly string[]
  /** The import specifier for a module, from the generated file. */
  specifier: (module: string) => string
  /**
   * The app's column coercion map. When it is non-empty and a service provides
   * `kysely`, that service's factory is wrapped so the `kysely` it returns
   * carries `createCoercionPlugin` from `@pikku/addon-kysely`, before any service
   * that needs `kysely` runs. A baseline `kysely` is the entry's own and is not
   * touched here.
   */
  coercionMap?: Record<string, Record<string, string>>
}

const importLine = (exported: string, local: string, from: string) =>
  exported === 'default'
    ? `import ${local} from ${JSON.stringify(from)}`
    : `import { ${exported} as ${local} } from ${JSON.stringify(from)}`

/**
 * The generated runner for one target (or one deploy unit). It imports only what
 * the target runs, so a variant that lives in a module of its own never reaches
 * a bundle for another target, and hands the services and what the inspector
 * read of them to core's `runProviders`.
 *
 * Exports `createPlatformServices(env, runtime)`, which builds every service on
 * a copy of `runtime` and returns it: the baseline the entry already holds, with
 * what the services provide over it. `serverStartHooks` lists the `onServerStart`
 * of the services that declare one, in run order, for the server lifecycle to
 * call; nothing in the file calls them. Teardown is each service's own `stop()`,
 * called by `stopSingletonServices` in the order `runProviders` computed, which
 * the file records in core's state.
 *
 * An addon's provider is registered with the env names its addon declares, so
 * it never sees the host's whole environment.
 *
 * Each collection is declared on the registry, so a reader finds a list even
 * when nothing adds to it; an item's `stop()` is run in `stopOrder`.
 *
 * With a `coercionMap`, the service providing `kysely` is wrapped (see
 * `SerializeProviderRunnerOptions.coercionMap`) so a deployed query returns the
 * Date, boolean and parsed JSON values `pikku dev` returns.
 */
export const serializeProviderRunner = ({
  target,
  profile,
  services,
  wire = [],
  collections = [],
  specifier,
  coercionMap,
}: SerializeProviderRunnerOptions): string => {
  const imports: string[] = []
  const adds: string[] = []
  const hooks: string[] = []
  const coerce =
    coercionMap !== undefined &&
    Object.keys(coercionMap).length > 0 &&
    services.some((service) => service.provides.includes('kysely'))

  const wireAdds: string[] = []
  const emit = (
    service: ResolvedProviderImport,
    index: number,
    kind: 'singleton' | 'wire',
    registryName: string,
    out: string[]
  ) => {
    const meta = JSON.stringify({
      [service.variant]: {
        needs: service.needs,
        optional: service.optional,
        provides: service.provides,
        optionalProvides: service.optionalProvides,
      },
    })
    const name = JSON.stringify(service.name)
    const registration = JSON.stringify({
      kind,
      ...(service.addTo ? { addTo: service.addTo } : {}),
      ...(service.addon ? { addon: service.addon } : {}),
    })
    const coerced = coerce && service.provides.includes('kysely')
    const wrap = (definition: string) =>
      coerced ? `withKyselyCoercion(${definition})` : definition
    // A variant in a module of its own is imported alone. A service with an
    // `onServerStart` is imported whole, since the hook lives on the definition.
    if (service.variantRef && !service.onServerStart) {
      const local = `variant${index}`
      imports.push(
        importLine(
          service.variantRef.export,
          local,
          specifier(service.variantRef.module)
        )
      )
      out.push(
        `${registryName}.add(${name}, ${wrap(`{ ${JSON.stringify(service.variant)}: ${local} }`)}, ${meta}, ${registration})`
      )
      return
    }
    const local = `service${index}`
    imports.push(importLine(service.export, local, specifier(service.module)))
    out.push(
      `${registryName}.add(${name}, ${wrap(local)}, ${meta}, ${registration})`
    )
    if (service.onServerStart) {
      hooks.push(
        `  { name: ${name}, run: (services) => ${local}.onServerStart!(services) },`
      )
    }
  }
  services.forEach((service, index) =>
    emit(service, index, 'singleton', 'registry', adds)
  )
  wire.forEach((service, index) =>
    emit(service, services.length + index, 'wire', 'wireRegistry', wireAdds)
  )

  const coercion = coerce
    ? [
        `const coercionMap = ${JSON.stringify(coercionMap)}`,
        ``,
        `type Factory = (services: any, env: any) => any`,
        `const withKyselyCoercion = (definition: any): any => {`,
        `  const wrap = (factory: Factory): Factory => async (services, env) => {`,
        `    const provided = await factory(services, env)`,
        `    if (!provided?.kysely) return provided`,
        `    const coerced = provided.kysely.withPlugin(createCoercionPlugin({ map: coercionMap as any }))`,
        `    return { ...provided, kysely: Object.assign(coerced, { stop: () => coerced.destroy() }) }`,
        `  }`,
        `  if (typeof definition === 'function') return wrap(definition)`,
        `  const wrapped = { ...definition }`,
        `  for (const [variant, factory] of Object.entries(definition)) {`,
        `    if (typeof factory === 'function' && variant !== 'onServerStart') wrapped[variant] = wrap(factory as Factory)`,
        `  }`,
        `  return wrapped`,
        `}`,
        ``,
      ]
    : []

  return [
    `import { ProviderRegistry, ${wire.length > 0 ? 'WireProviders, ' : ''}recordStopOrder, runProviders } from '@pikku/core/provider'`,
    ...(wire.length > 0
      ? [`import { pikkuState } from '@pikku/core/state'`]
      : []),
    ...(coerce
      ? [`import { createCoercionPlugin } from '@pikku/addon-kysely'`]
      : []),
    ...imports,
    ``,
    ...coercion,
    `const registry = new ProviderRegistry()`,
    ...adds,
    ...collections.map(
      (name) => `registry.collection(${JSON.stringify(name)})`
    ),
    ...(wire.length > 0
      ? [
          `const wireRegistry = new ProviderRegistry()`,
          ...wireAdds,
          `const wireProviders = new WireProviders(wireRegistry, { target: ${JSON.stringify(target)},${profile ? ` profile: ${JSON.stringify(profile)},` : ''} })`,
          ``,
          `export const createProviderWireServices = (singletons: object, wire: any, options?: { needs?: readonly string[], held?: Record<string, unknown> }) =>`,
          `  wireProviders.run(singletons, wire, options)`,
        ]
      : []),
    ``,
    `export const createPlatformServices = async (`,
    `  env: Record<string, string | undefined>,`,
    `  runtime: Record<string, unknown> = {}`,
    `): Promise<Record<string, unknown>> => {`,
    `  const services: Record<string, unknown> = { ...runtime }`,
    `  const { stopOrder } = await runProviders(registry, { target: ${JSON.stringify(target)},${profile ? ` profile: ${JSON.stringify(profile)},` : ''} services, env })`,
    `  recordStopOrder(stopOrder, Object.keys(services))`,
    ...(wire.length > 0
      ? [
          `  pikkuState(null, 'package', 'wireProviders', createProviderWireServices)`,
        ]
      : []),
    `  return services`,
    `}`,
    ``,
    `type ServerHook = { name: string, run: (services: Record<string, unknown>) => void | Promise<void> }`,
    ``,
    `export const serverStartHooks: ServerHook[] = [`,
    ...hooks,
    `]`,
    ``,
  ].join('\n')
}
