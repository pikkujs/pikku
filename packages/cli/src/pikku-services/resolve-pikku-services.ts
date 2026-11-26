import { existsSync } from 'node:fs'
import { dirname, join, parse, posix, resolve } from 'node:path'
import {
  ServiceRegistry,
  type PikkuServiceMeta as CorePikkuServiceMeta,
  type PikkuServiceTarget,
  type PikkuServiceVariants,
  type PikkuServiceVariantName,
} from '@pikku/core/pikku-service'
import { addonResolutionDirs } from '@pikku/inspector'
import type {
  InspectorState,
  PikkuServiceMeta,
  PikkuServiceVariantMeta,
} from '@pikku/inspector'

/** Where a variant is imported from, when it is a reference to an exported const. */
export interface ServiceImportRef {
  /** Absolute path of the module that exports it. */
  module: string
  export: string
}

/** One service picked for a target, in run order, with what a generator imports. */
export interface ResolvedServiceImport {
  /** The name it runs under: the exported name, or `<namespace>/<name>` for an addon's. */
  name: string
  variant: PikkuServiceVariantName
  needs: readonly string[]
  provides: readonly string[]
  /** Absolute path of the module exporting the `pikkuService` const. */
  module: string
  export: string
  /** Set when the chosen variant lives in a module of its own. */
  variantRef?: ServiceImportRef
  onServerStart: boolean
}

export interface ResolvedPikkuServices {
  target: PikkuServiceTarget
  /** In run order: every service runs after the ones providing what it needs. */
  ordered: ResolvedServiceImport[]
  /** The keys held before any service runs. */
  baseline: readonly string[]
}

type ServicesState = Pick<
  InspectorState,
  'pikkuServices' | 'optedInServices' | 'projectServicesRead'
> & {
  rpc: { wireAddonDeclarations: InspectorState['rpc']['wireAddonDeclarations'] }
}

/** A service the project declares or opted in to, before a target picks its variant. */
export interface ServiceSource {
  name: string
  module: string
  export: string
  meta: PikkuServiceMeta
  /** The addon namespace, for an opted-in service. */
  namespace?: string
  packageName?: string
  /** Absolute path of an opted-in variant's module, by variant. */
  variantModules: Partial<Record<PikkuServiceVariantName, ServiceImportRef>>
}

const findInstalledPackageDir = (
  dirs: string[],
  packageName: string
): string | undefined => {
  for (const start of dirs) {
    const root = parse(start).root
    for (let dir = start; ; dir = dirname(dir)) {
      const candidate = join(dir, 'node_modules', packageName)
      if (existsSync(join(candidate, 'package.json'))) return candidate
      if (dir === root || dirname(dir) === dir) break
    }
  }
  return undefined
}

/**
 * The file an addon's recorded module is to be imported from. The inspector
 * records the `.ts` source, which is what a workspace addon (or one that ships
 * its source) has on disk. A published addon ships only its build, so the same
 * path is looked for under `dist/` as `.js`: first keeping the `src/` prefix
 * (`rootDir: "."`), then without it (`rootDir: "src"`).
 */
export const locateServiceModule = (
  packageDir: string,
  module: string,
  describe: string
): string => {
  const source = resolve(packageDir, module)
  if (existsSync(source)) return source
  const asJs = posix.normalize(module).replace(/\.[cm]?tsx?$/, '.js')
  const built = [asJs, asJs.replace(/^src\//, '')]
    .filter((path, index, all) => all.indexOf(path) === index)
    .map((path) => resolve(packageDir, 'dist', path))
  const found = built.find((candidate) => existsSync(candidate))
  if (found) return found
  throw new Error(
    `${describe} is recorded at ${module}, but none of ${[source, ...built].join(', ')} exists.`
  )
}

const variantNames = ['dev', 'deploy', 'common'] as const

/**
 * Every service a build can pick from: the ones the project declares with
 * `pikkuService` (the root), then the ones it opted in to with
 * `wireAddon({ services })`, located on disk.
 */
export const collectServiceSources = (
  state: ServicesState,
  rootDir: string
): ServiceSource[] => {
  const sources: ServiceSource[] = []
  for (const [name, meta] of Object.entries(state.pikkuServices ?? {})) {
    const variantModules: ServiceSource['variantModules'] = {}
    for (const variant of variantNames) {
      const { module, export: exported } = meta.variants[variant] ?? {}
      if (module && exported)
        variantModules[variant] = { module, export: exported }
    }
    sources.push({
      name,
      module: meta.module,
      export: meta.export,
      meta,
      variantModules,
    })
  }
  for (const [namespace, opted] of Object.entries(
    state.optedInServices ?? {}
  )) {
    const declaration = state.rpc.wireAddonDeclarations.get(namespace)
    const dirs = addonResolutionDirs(rootDir, declaration?.file)
    const packageDir = findInstalledPackageDir(dirs, opted.packageName)
    for (const [name, meta] of Object.entries(opted.services)) {
      if (!packageDir) {
        throw new Error(
          `wireAddon('${namespace}') opts in to service '${name}', but ${opted.packageName} is not installed where it can be resolved from ${dirs.join(' or ')}.`
        )
      }
      const describe = `Service '${name}' of addon '${namespace}' (${opted.packageName})`
      const variantModules: ServiceSource['variantModules'] = {}
      for (const variant of variantNames) {
        const ref = meta.variants[variant]
        if (ref?.module && ref.export) {
          variantModules[variant] = {
            module: locateServiceModule(packageDir, ref.module, describe),
            export: ref.export,
          }
        }
      }
      sources.push({
        name: `${namespace}/${name}`,
        namespace,
        packageName: opted.packageName,
        module: locateServiceModule(packageDir, meta.module, describe),
        export: meta.export,
        meta,
        variantModules,
      })
    }
  }
  return sources
}

/** The variant a target runs: its own, else `common`. */
export const variantFor = (
  meta: PikkuServiceMeta,
  target: PikkuServiceTarget
): PikkuServiceVariantName | undefined =>
  meta.variants[target] ? target : meta.variants.common ? 'common' : undefined

/** Every key any variant of the service provides. */
export const providedKeys = (meta: PikkuServiceMeta): string[] => [
  ...new Set(
    Object.values(meta.variants).flatMap(
      (variant: PikkuServiceVariantMeta | undefined) => variant?.provides ?? []
    )
  ),
]

const noop = () => ({})

/**
 * The one resolver for `pikku dev` and every deploy unit. It reads what the
 * inspector recorded and never loads user code: core's `ServiceRegistry` picks
 * each service's variant for `target` against stand-in factories, and checks
 * that every key has one provider, every need is met and nothing is cyclic.
 *
 * On top of that this checks what only a build can:
 *
 * - every target is covered: a service with neither a variant for the target nor
 *   `common` is an error, unless every key it provides is one the target's
 *   baseline already holds (core's dev default, say), in which case the target
 *   simply does not run it;
 * - a baseline key may be replaced by exactly one service;
 * - a target that does not run the server lifecycle cannot run an
 *   `onServerStart`, so a selected service with one is an error rather than a
 *   hook that never fires.
 *
 * Only the services the target reaches are selected. The seed is
 * `requiredServices` (what the target's functions, middleware, permissions and
 * other wirings destructure) plus `factoryServices` (what the project's own
 * `pikkuServices` factory reads); a service joins when one key it provides is
 * reached, and what it needs is reached too, transitively. A service nothing
 * reaches gets no variant check, no `onServerStart` error and no import. A
 * service replacing a baseline key is selected when that key is reached. Two
 * services providing one key still fail on every target, reached or not.
 *
 * `baseline` is the keys the target holds before any service runs: what
 * `pikku dev` passes in, or what the unit's entry builds.
 */
export const resolvePikkuServices = (options: {
  state: ServicesState
  rootDir: string
  target: PikkuServiceTarget
  baseline: readonly string[]
  /** Services the target's functions, middleware, permissions and wirings destructure. */
  requiredServices: Iterable<string>
  /** Services the project's own `pikkuServices` factory destructures. */
  factoryServices?: Iterable<string>
  /**
   * Whether the target runs the server lifecycle (`pikku dev`, a server or
   * container entry). Defaults to true.
   */
  runsServerLifecycle?: boolean
  /** Names the target in errors ("The standalone deploy"). */
  targetLabel?: string
  /** Names what is being built in the `onServerStart` error ("unit 'api'"). */
  unitLabel?: string
}): ResolvedPikkuServices => {
  const { target, baseline } = options
  const label = options.targetLabel ?? `The ${target} target`
  const sources = collectServiceSources(options.state, options.rootDir)
  const baselineKeys = new Set(baseline)

  const keysOf = (source: ServiceSource): string[] => {
    const variant = variantFor(source.meta, target)
    return variant
      ? [...source.meta.variants[variant]!.provides]
      : providedKeys(source.meta)
  }

  const owners = new Map<string, ServiceSource>()
  for (const source of sources) {
    for (const key of keysOf(source)) {
      const owner = owners.get(key)
      if (owner && owner !== source) {
        throw new Error(
          `Services '${owner.name}' and '${source.name}' both provide '${key}' on ${target}. Each service key has one provider.`
        )
      }
      owners.set(key, source)
    }
  }

  const reached = new Set<string>([
    ...options.requiredServices,
    ...(options.factoryServices ?? []),
  ])
  const selected = new Set<ServiceSource>()
  for (let grew = true; grew;) {
    grew = false
    for (const source of sources) {
      if (selected.has(source)) continue
      if (!keysOf(source).some((key) => reached.has(key))) continue
      selected.add(source)
      grew = true
      const variant = variantFor(source.meta, target)
      for (const need of variant ? source.meta.variants[variant]!.needs : []) {
        reached.add(need)
      }
    }
  }

  const registry = new ServiceRegistry()
  const byName = new Map<string, ServiceSource>()
  for (const source of sources) {
    if (!selected.has(source)) continue
    const variant = variantFor(source.meta, target)
    if (!variant) {
      const keys = providedKeys(source.meta)
      const uncovered = keys.filter((key) => !baselineKeys.has(key))
      if (keys.length === 0 || uncovered.length > 0) {
        const lacking =
          uncovered.length > 0
            ? uncovered.map((key) => `'${key}'`).join(', ')
            : `'${source.name}'`
        throw new Error(
          `Service '${source.name}' has no ${target} variant and no common variant, so ${label} would run without ${lacking}. Give it a ${target} or common variant${target === 'dev' ? ', or have it provide only keys the dev baseline already holds' : ''}.`
        )
      }
      continue
    }
    const meta: CorePikkuServiceMeta = {
      [variant]: source.meta.variants[variant]!,
    }
    // Stand-ins: resolution reads the inspector's meta and never calls them.
    const definition = {
      [variant]: noop,
      ...(source.meta.onServerStart ? { onServerStart: noop } : {}),
    } as PikkuServiceVariants
    registry.add(source.name, definition, meta)
    byName.set(source.name, source)
  }

  const resolved = registry.resolve(target, { baseline })

  if (options.runsServerLifecycle === false) {
    const starting = resolved.filter((service) => service.onServerStart)
    if (starting.length > 0) {
      const where = options.unitLabel ? ` in ${options.unitLabel}` : ''
      throw new Error(
        `${label} does not run the server lifecycle, so onServerStart would never be called: ${starting.map(({ name }) => `service '${name}'`).join(', ')}${where}. Remove ${starting.length === 1 ? 'it' : 'them'} from the project (or from wireAddon({ services })), or deploy this unit as a server (container) target.`
      )
    }
  }

  return {
    target,
    baseline,
    ordered: resolved.map((service) => {
      const source = byName.get(service.name)!
      return {
        name: service.name,
        variant: service.variant,
        needs: service.needs,
        provides: service.provides,
        module: source.module,
        export: source.export,
        ...(source.variantModules[service.variant]
          ? { variantRef: source.variantModules[service.variant] }
          : {}),
        onServerStart: Boolean(service.onServerStart),
      }
    }),
  }
}

/**
 * Resolves every target, so a service that fails on one of them is a build
 * error. A baseline is given per target because `pikku dev` holds more than a
 * deploy entry does.
 */
export const resolveAllTargets = (options: {
  state: ServicesState
  rootDir: string
  requiredServices: Iterable<string>
  factoryServices?: Iterable<string>
  baseline: Record<PikkuServiceTarget, readonly string[]>
}): Record<PikkuServiceTarget, ResolvedPikkuServices> => ({
  dev: resolvePikkuServices({
    ...options,
    target: 'dev',
    baseline: options.baseline.dev,
  }),
  deploy: resolvePikkuServices({
    ...options,
    target: 'deploy',
    baseline: options.baseline.deploy,
  }),
})
