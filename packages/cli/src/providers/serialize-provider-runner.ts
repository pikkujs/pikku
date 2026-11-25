import type { ProviderTarget } from '@pikku/core/provider'
import type { ResolvedProviderImport } from './resolve-providers.js'

export interface SerializeProviderRunnerOptions {
  target: ProviderTarget
  /** In run order, as `resolveProviders` returned them. */
  services: readonly ResolvedProviderImport[]
  /** The import specifier for a module, from the generated file. */
  specifier: (module: string) => string
  /**
   * The app's column coercion map. When it is non-empty and a service provides
   * `kysely`, that service's factory is wrapped so the `kysely` it returns
   * carries `createCoercionPlugin` from `@pikku/kysely`, before any service
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
 * called by `stopSingletonServices`.
 *
 * With a `coercionMap`, the service providing `kysely` is wrapped (see
 * `SerializeProviderRunnerOptions.coercionMap`) so a deployed query returns the
 * Date, boolean and parsed JSON values `pikku dev` returns.
 */
export const serializeProviderRunner = ({
  target,
  services,
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

  services.forEach((service, index) => {
    const meta = JSON.stringify({
      [service.variant]: { needs: service.needs, provides: service.provides },
    })
    const name = JSON.stringify(service.name)
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
      adds.push(
        `registry.add(${name}, ${wrap(`{ ${service.variant}: ${local} }`)}, ${meta})`
      )
      return
    }
    const local = `service${index}`
    imports.push(importLine(service.export, local, specifier(service.module)))
    adds.push(`registry.add(${name}, ${wrap(local)}, ${meta})`)
    if (service.onServerStart) {
      hooks.push(
        `  { name: ${name}, run: (services) => ${local}.onServerStart!(services) },`
      )
    }
  })

  const coercion = coerce
    ? [
        `const coercionMap = ${JSON.stringify(coercionMap)}`,
        ``,
        `type Factory = (services: any, env: any) => any`,
        `const withKyselyCoercion = (definition: any): any => {`,
        `  const wrap = (factory: Factory): Factory => async (services, env) => {`,
        `    const provided = await factory(services, env)`,
        `    return provided?.kysely`,
        `      ? { ...provided, kysely: provided.kysely.withPlugin(createCoercionPlugin({ map: coercionMap as any })) }`,
        `      : provided`,
        `  }`,
        `  if (typeof definition === 'function') return wrap(definition)`,
        `  const wrapped = { ...definition }`,
        `  for (const variant of ['dev', 'deploy', 'common']) {`,
        `    if (definition[variant]) wrapped[variant] = wrap(definition[variant])`,
        `  }`,
        `  return wrapped`,
        `}`,
        ``,
      ]
    : []

  return [
    `import { ProviderRegistry, runProviders } from '@pikku/core/provider'`,
    ...(coerce ? [`import { createCoercionPlugin } from '@pikku/kysely'`] : []),
    ...imports,
    ``,
    ...coercion,
    `const registry = new ProviderRegistry()`,
    ...adds,
    ``,
    `export const createPlatformServices = async (`,
    `  env: Record<string, string | undefined>,`,
    `  runtime: Record<string, unknown> = {}`,
    `): Promise<Record<string, unknown>> => {`,
    `  const services: Record<string, unknown> = { ...runtime }`,
    `  await runProviders(registry, { target: ${JSON.stringify(target)}, services, env })`,
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
