import { existsSync } from 'node:fs'
import { dirname, join, parse, posix, resolve } from 'node:path'
import {
  ProviderRegistry,
  variantOrder,
  type ProviderMeta as CoreProviderMeta,
  type ProviderProfile,
  type ProviderTarget,
  type ProviderVariants,
  type ProviderVariantName,
} from '@pikku/core/provider'
import { ErrorCode, addonResolutionDirs } from '@pikku/inspector'
import { ProviderBuildError, toBuildError } from './provider-build-error.js'
import type {
  InspectorState,
  ProviderMeta,
  ProviderVariantMeta,
} from '@pikku/inspector'

/** Where a variant is imported from, when it is a reference to an exported const. */
export interface ProviderImportRef {
  /** Absolute path of the module that exports it. */
  module: string
  export: string
}

/** One service picked for a target, in run order, with what a generator imports. */
export interface ResolvedProviderImport {
  /** The name it runs under: the exported name, or `<namespace>/<name>` for an addon's. */
  name: string
  variant: ProviderVariantName
  needs: readonly string[]
  optional: readonly string[]
  provides: readonly string[]
  optionalProvides: readonly string[]
  /** Absolute path of the module exporting the `defineProvider` const. */
  module: string
  export: string
  /** Set when the chosen variant lives in a module of its own. */
  variantRef?: ProviderImportRef
  onServerStart: boolean
}

export interface ResolvedProviders {
  target: ProviderTarget
  /** In run order: every service runs after the ones providing what it needs. */
  ordered: ResolvedProviderImport[]
  /** The keys held before any service runs. */
  baseline: readonly string[]
}

type ProvidersState = Pick<
  InspectorState,
  'providers' | 'optedInProviders' | 'projectServicesRead'
> &
  Partial<
    Pick<
      InspectorState,
      | 'projectServicesProvided'
      | 'projectWireServicesProvided'
      | 'providerCollections'
      | 'serviceTypes'
    >
  > & {
    rpc: {
      wireAddonDeclarations: InspectorState['rpc']['wireAddonDeclarations']
    }
  }

/** A service the project declares or opted in to, before a target picks its variant. */
export interface ProviderSource {
  name: string
  module: string
  export: string
  meta: ProviderMeta
  /** The addon namespace, for an opted-in service. */
  namespace?: string
  packageName?: string
  /** Absolute path of an opted-in variant's module, by variant. */
  variantModules: Partial<Record<ProviderVariantName, ProviderImportRef>>
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
export const locateProviderModule = (
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

/**
 * Every service a build can pick from: the ones the project declares with
 * `defineProvider` (the root), then the ones it opted in to with
 * `wireAddon({ services })`, located on disk.
 */
export const collectProviderSources = (
  state: ProvidersState,
  rootDir: string
): ProviderSource[] => {
  const sources: ProviderSource[] = []
  for (const [name, meta] of Object.entries(state.providers ?? {})) {
    const variantModules: ProviderSource['variantModules'] = {}
    for (const [variant, read] of variantEntries(meta)) {
      if (read.module && read.export)
        variantModules[variant] = { module: read.module, export: read.export }
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
    state.optedInProviders ?? {}
  )) {
    const declaration = state.rpc.wireAddonDeclarations.get(namespace)
    const dirs = addonResolutionDirs(rootDir, declaration?.file)
    const packageDir = findInstalledPackageDir(dirs, opted.packageName)
    for (const [name, meta] of Object.entries(opted.providers)) {
      if (!packageDir) {
        throw new Error(
          `wireAddon('${namespace}') opts in to provider '${name}', but ${opted.packageName} is not installed where it can be resolved from ${dirs.join(' or ')}.`
        )
      }
      const describe = `Provider '${name}' of addon '${namespace}' (${opted.packageName})`
      const variantModules: ProviderSource['variantModules'] = {}
      for (const [variant, ref] of variantEntries(meta)) {
        if (ref.module && ref.export) {
          variantModules[variant] = {
            module: locateProviderModule(packageDir, ref.module, describe),
            export: ref.export,
          }
        }
      }
      sources.push({
        name: `${namespace}/${name}`,
        namespace,
        packageName: opted.packageName,
        module: locateProviderModule(packageDir, meta.module, describe),
        export: meta.export,
        meta,
        variantModules,
      })
    }
  }
  return sources
}

const variantEntries = (meta: ProviderMeta) =>
  Object.entries(meta.variants) as [ProviderVariantName, ProviderVariantMeta][]

/** The variant a target runs: `deploy:<profile>`, then `deploy` (or `dev`), then `common`. */
export const variantFor = (
  meta: ProviderMeta,
  target: ProviderTarget,
  profile?: ProviderProfile
): ProviderVariantName | undefined =>
  variantOrder(target, profile).find((variant) => meta.variants[variant])

/** Every key any variant of the service provides. */
export const providedKeys = (meta: ProviderMeta): string[] => [
  ...new Set(
    Object.values(meta.variants).flatMap(
      (variant: ProviderVariantMeta | undefined) => variant?.provides ?? []
    )
  ),
]

/** Every key some variant of the provider returns only sometimes. */
export const optionalProvidedKeys = (meta: ProviderMeta): string[] => [
  ...new Set(
    Object.values(meta.variants).flatMap(
      (variant: ProviderVariantMeta | undefined) =>
        variant?.optionalProvides ?? []
    )
  ),
]

const noop = () => ({})

/** The keys core builds for every invocation, which no provider supplies. */
export const CORE_PER_REQUEST_KEYS = [
  'auditLog',
  'analytics',
  'rpc',
  'session',
  'userSession',
] as const

/** One function and the services it destructures, for the per-unit needs check. */
export interface FunctionNeeds {
  name: string
  needs: readonly string[]
}

/** The services each function destructures, for `ids` (every function when omitted). */
export const functionNeedsOf = (
  functionsMeta: Record<
    string,
    { services?: { services?: readonly string[] } } | undefined
  >,
  ids?: Iterable<string>
): FunctionNeeds[] =>
  [...(ids ?? Object.keys(functionsMeta))].flatMap((name) => {
    const needs = functionsMeta[name]?.services?.services
    return needs && needs.length > 0 ? [{ name, needs }] : []
  })

const capitalise = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)

/**
 * The one resolver for `pikku dev` and every deploy unit. It reads what the
 * inspector recorded and never loads user code: core's `ProviderRegistry` picks
 * each provider's variant for `target` (and `profile`) against stand-in
 * factories, and checks that every key has one provider, every need is met and
 * nothing is cyclic.
 *
 * On top of that this checks what only a build can:
 *
 * - every target is covered: a provider with no variant for the target (looked
 *   for in `variantOrder`) is an error, unless every key it provides is one the
 *   target's baseline already holds, in which case the target simply does not
 *   run it;
 * - a baseline key may be replaced by exactly one provider, and never an
 *   `entryOwned` one, which the entry opens itself;
 * - a need on a key that may be absent has to be listed in `optional`; a listed
 *   need nothing provides is skipped;
 * - a target that does not run the server lifecycle cannot run an
 *   `onServerStart`, so a selected provider with one is an error rather than a
 *   hook that never fires;
 * - every function in `functions` finds the keys it destructures: in the
 *   baseline, a selected provider, what the project's factories return, or what
 *   core builds per request. A key that may be absent is not required.
 *
 * Only the providers the target reaches are selected. The seed is
 * `requiredServices` (what the target's functions, middleware, permissions and
 * other wirings destructure) plus `factoryServices` (what the project's own
 * `pikkuServices` factory reads); a provider joins when one key it provides is
 * reached, and what it needs is reached too, transitively. An optional need
 * joins reachability only when some provider provides it. A provider nothing
 * reaches gets no variant check, no `onServerStart` error and no import. Two
 * providers providing one key still fail on every target, reached or not.
 *
 * `baseline` is the keys the target holds before any provider runs: what
 * `pikku dev` passes in, or what the unit's entry builds.
 */
export const resolveProviders = (options: {
  state: ProvidersState
  rootDir: string
  target: ProviderTarget
  /** The deploy runtime, which picks a `deploy:<profile>` variant. */
  profile?: ProviderProfile
  baseline: readonly string[]
  /** Keys the entry opens itself, which no provider may replace. */
  entryOwned?: readonly string[]
  /** Services the target's functions, middleware, permissions and wirings destructure. */
  requiredServices: Iterable<string>
  /** Services the project's own `pikkuServices` factory destructures. */
  factoryServices?: Iterable<string>
  /** The functions the target runs, checked against what it holds. */
  functions?: readonly FunctionNeeds[]
  /**
   * Whether the target runs the server lifecycle (`pikku dev`, a server or
   * container entry). Defaults to true.
   */
  runsServerLifecycle?: boolean
  /** Names the target in errors ("the standalone deploy"). */
  targetLabel?: string
  /** Names what is being built in errors ("unit 'api'"). */
  unitLabel?: string
}): ResolvedProviders => {
  const { target, baseline, profile } = options
  const targetLabel = options.targetLabel ?? `the ${target} target`
  const where = options.unitLabel
    ? `${targetLabel} (${options.unitLabel})`
    : targetLabel
  const sources = collectProviderSources(options.state, options.rootDir)
  const baselineKeys = new Set(baseline)
  const looked = variantOrder(target, profile)

  const keysOf = (source: ProviderSource): string[] => {
    const variant = variantFor(source.meta, target, profile)
    return variant
      ? [...source.meta.variants[variant]!.provides]
      : providedKeys(source.meta)
  }

  const owners = new Map<string, ProviderSource>()
  for (const source of sources) {
    for (const key of keysOf(source)) {
      const owner = owners.get(key)
      if (owner && owner !== source) {
        throw new ProviderBuildError(
          ErrorCode.PROVIDER_KEY_DUPLICATED,
          `Providers '${owner.name}' and '${source.name}' both provide '${key}' on ${where}. Each key has one provider.`
        )
      }
      owners.set(key, source)
    }
  }

  const reached = new Set<string>([
    ...options.requiredServices,
    ...(options.factoryServices ?? []),
  ])
  const selected = new Set<ProviderSource>()
  for (let grew = true; grew;) {
    grew = false
    for (const source of sources) {
      if (selected.has(source)) continue
      if (!keysOf(source).some((key) => reached.has(key))) continue
      selected.add(source)
      grew = true
      const variant = variantFor(source.meta, target, profile)
      const read = variant ? source.meta.variants[variant]! : undefined
      for (const need of read?.needs ?? []) {
        if (read!.optional?.includes(need) && !owners.has(need)) continue
        reached.add(need)
      }
    }
  }

  const registry = new ProviderRegistry()
  const byName = new Map<string, ProviderSource>()
  for (const source of sources) {
    if (!selected.has(source)) continue
    const variant = variantFor(source.meta, target, profile)
    if (!variant) {
      const keys = providedKeys(source.meta)
      const uncovered = keys.filter((key) => !baselineKeys.has(key))
      if (keys.length === 0 || uncovered.length > 0) {
        const lacking =
          uncovered.length > 0
            ? uncovered.map((key) => `'${key}'`).join(', ')
            : `'${source.name}'`
        throw new ProviderBuildError(
          ErrorCode.PROVIDER_NO_VARIANT,
          `Provider '${source.name}' has no variant for ${where} (looked for ${looked.join(', ')}), so it would run without ${lacking}. Give it one of those, or have it provide only keys ${targetLabel} already holds.`
        )
      }
      continue
    }
    const meta: CoreProviderMeta = {
      [variant]: source.meta.variants[variant]!,
    }
    // Stand-ins: resolution reads the inspector's meta and never calls them.
    const definition = {
      [variant]: noop,
      ...(source.meta.onServerStart ? { onServerStart: noop } : {}),
    } as ProviderVariants
    registry.add(source.name, definition, meta)
    byName.set(source.name, source)
  }

  let resolved: ReturnType<ProviderRegistry['resolve']>
  try {
    resolved = registry.resolve(target, {
      baseline,
      profile,
      entryOwned: options.entryOwned,
      where,
    })
  } catch (error) {
    throw toBuildError(error)
  }

  if (options.runsServerLifecycle === false) {
    const starting = resolved.filter((service) => service.onServerStart)
    if (starting.length > 0) {
      throw new ProviderBuildError(
        ErrorCode.PROVIDER_START_UNSUPPORTED,
        `${capitalise(targetLabel)} does not run the server lifecycle, so onServerStart would never be called: ${starting.map(({ name }) => `provider '${name}'`).join(', ')}${options.unitLabel ? ` in ${options.unitLabel}` : ''}. Remove ${starting.length === 1 ? 'it' : 'them'} from the project (or from wireAddon({ providers })), or deploy this unit as a server (container) target.`
      )
    }
  }

  if (options.functions) {
    checkFunctionNeeds({
      functions: options.functions,
      state: options.state,
      baseline: baselineKeys,
      resolved,
      where,
    })
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
        optional: service.optional,
        provides: service.provides,
        optionalProvides: service.optionalProvides,
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
 * Every need of every function has to be held somewhere. Without a read of the
 * project's factories (the inspector found none), every key of the declared
 * services type counts as built; a key that may be absent is never required.
 */
const checkFunctionNeeds = ({
  functions,
  state,
  baseline,
  resolved,
  where,
}: {
  functions: readonly FunctionNeeds[]
  state: ProvidersState
  baseline: ReadonlySet<string>
  resolved: readonly {
    provides: readonly string[]
    optionalProvides: readonly string[]
  }[]
  where: string
}): void => {
  const held = new Set<string>([...baseline, ...CORE_PER_REQUEST_KEYS])
  const soft = new Set<string>(state.serviceTypes?.singletonOptional ?? [])
  for (const service of resolved) {
    for (const key of service.provides) held.add(key)
    for (const key of service.optionalProvides) soft.add(key)
  }
  for (const source of Object.values(state.providers ?? {})) {
    if (source.kind !== 'wire') continue
    for (const variant of Object.values(source.variants)) {
      for (const key of variant?.provides ?? []) held.add(key)
      for (const key of variant?.optionalProvides ?? []) soft.add(key)
    }
  }
  for (const name of Object.keys(state.providerCollections ?? {}))
    held.add(name)
  for (const opted of Object.values(state.optedInProviders ?? {})) {
    for (const name of Object.keys(opted.collections ?? {})) held.add(name)
  }
  for (const factory of [
    state.projectServicesProvided,
    state.projectWireServicesProvided,
  ]) {
    for (const key of factory?.keys ?? []) held.add(key)
    for (const key of factory?.optional ?? []) soft.add(key)
  }
  if (!state.projectServicesProvided) {
    for (const key of state.serviceTypes?.singletonServices ?? []) held.add(key)
  }
  if (!state.projectWireServicesProvided) {
    for (const key of state.serviceTypes?.services ?? []) held.add(key)
  }
  for (const { name, needs } of functions) {
    for (const need of needs) {
      if (held.has(need) || soft.has(need)) continue
      throw new ProviderBuildError(
        ErrorCode.FUNCTION_NEED_UNMET,
        `Function '${name}' needs '${need}' in ${where}, which nothing provides: no provider, no baseline key, and the project's pikkuServices factory does not return it.`
      )
    }
  }
}

/**
 * Resolves every target, so a provider that fails on one of them is a build
 * error. A baseline is given per target because `pikku dev` holds more than a
 * deploy entry does.
 */
export const resolveAllTargets = (options: {
  state: ProvidersState
  rootDir: string
  requiredServices: Iterable<string>
  factoryServices?: Iterable<string>
  baseline: Record<ProviderTarget, readonly string[]>
}): Record<ProviderTarget, ResolvedProviders> => ({
  dev: resolveProviders({
    ...options,
    target: 'dev',
    baseline: options.baseline.dev,
  }),
  deploy: resolveProviders({
    ...options,
    target: 'deploy',
    baseline: options.baseline.deploy,
  }),
})
