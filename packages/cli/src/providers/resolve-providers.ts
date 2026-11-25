import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, parse, posix, resolve } from 'node:path'
import {
  ProviderRegistry,
  variantOrder,
  type ProviderAddonScope,
  type ProviderMeta as CoreProviderMeta,
  type ProviderProfile,
  type ProviderTarget,
  type ResolvedProvider,
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
  /** Set for an addon's provider: the env names it may read. */
  addon?: ProviderAddonScope
  /** The collection an item provider adds its one item to. */
  addTo?: string
  onServerStart: boolean
}

export interface ResolvedProviders {
  target: ProviderTarget
  /** In run order: every service runs after the ones providing what it needs. */
  ordered: ResolvedProviderImport[]
  /** The keys held before any service runs. */
  baseline: readonly string[]
  /** The collections the target holds: every one a selected provider reads or adds to. */
  collections: readonly string[]
  /** The per-request providers the target reaches, in the order a request builds them. */
  wire: ResolvedProviderImport[]
}

/** The collections core declares, which any project's providers may add to. */
export const CORE_COLLECTIONS: Readonly<Record<string, string>> = {
  analyticsSinks: '@pikku/core/analytics',
}

/**
 * Whether a resolution has nothing to run: no provider and no collection of the
 * project's own. Core's collections need no runner of their own, since a reader
 * of one finds it unset and falls back.
 */
export const runsNothing = (resolved: ResolvedProviders): boolean =>
  resolved.ordered.length === 0 &&
  resolved.wire.length === 0 &&
  resolved.collections.every((name) => name in CORE_COLLECTIONS)

/** Every collection name the build knows, with the module that declares it. */
export const knownCollections = (
  state: Pick<ProvidersState, 'providerCollections' | 'optedInProviders'> &
    Partial<Pick<ProvidersState, 'providers'>>
): Map<string, string> => {
  const known = new Map<string, string>(Object.entries(CORE_COLLECTIONS))
  for (const [name, collection] of Object.entries(
    state.providerCollections ?? {}
  )) {
    known.set(name, collection.module)
  }
  for (const [namespace, opted] of Object.entries(
    state.optedInProviders ?? {}
  )) {
    for (const [name, collection] of Object.entries(opted.collections ?? {})) {
      known.set(name, `${opted.packageName}:${collection.module}`)
    }
    for (const meta of Object.values(opted.providers)) {
      if (meta.addTo && !known.has(meta.addTo)) known.set(meta.addTo, namespace)
    }
  }
  for (const meta of Object.values(state.providers ?? {})) {
    if (meta.addTo && !known.has(meta.addTo))
      known.set(meta.addTo, 'the project')
  }
  return known
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
  /** What an opted-in provider may read of the environment. */
  addonScope?: ProviderAddonScope
  /** Absolute path of an opted-in variant's module, by variant. */
  variantModules: Partial<Record<ProviderVariantName, ProviderImportRef>>
}

const declaredIds = (path: string, idKey: string): string[] => {
  if (!existsSync(path)) return []
  const meta = JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>
  return Object.entries(meta).map(([key, entry]) => entry?.[idKey] ?? key)
}

/**
 * The environment names an addon's providers may read: the variables and
 * secrets the addon declares (read from its built meta, in `dist` or beside
 * the source), plus the names `wireAddon`'s overrides grant, each mapped to the
 * host name behind it. An addon that was never built declares nothing.
 */
export const addonProviderScope = (
  namespace: string,
  packageDir: string,
  overrides: {
    variableOverrides?: Record<string, string>
    secretOverrides?: Record<string, string>
  } = {}
): ProviderAddonScope => {
  const metaDir = [
    join(packageDir, 'dist', '.pikku', 'addon'),
    join(packageDir, '.pikku', 'addon'),
  ].find((dir) => existsSync(dir))
  const declared = metaDir
    ? [
        ...declaredIds(
          join(metaDir, 'variables', 'pikku-variables-meta.gen.json'),
          'variableId'
        ),
        ...declaredIds(
          join(metaDir, 'secrets', 'pikku-secrets-meta.gen.json'),
          'secretId'
        ),
      ]
    : []
  const rename = {
    ...overrides.variableOverrides,
    ...overrides.secretOverrides,
  }
  const names = [...new Set([...declared, ...Object.keys(rename)])].sort()
  const sortedRename = Object.fromEntries(
    Object.entries(rename).sort(([a], [b]) => a.localeCompare(b))
  )
  return {
    namespace,
    env: names,
    ...(Object.keys(sortedRename).length > 0
      ? { envRename: sortedRename }
      : {}),
  }
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
    const addonScope = packageDir
      ? addonProviderScope(namespace, packageDir, declaration)
      : undefined
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
        addonScope,
        module: locateProviderModule(packageDir, meta.module, describe),
        export: meta.export,
        meta,
        variantModules,
      })
    }
  }
  return sources
}

/**
 * The collections the project and its opted-in addons declare, each with the
 * absolute module that exports it. Core's own are not here: they are imported
 * by package name.
 */
export const collectProviderCollections = (
  state: Pick<
    ProvidersState,
    'providerCollections' | 'optedInProviders' | 'rpc'
  >,
  rootDir: string
): { name: string; module: string; export: string }[] => {
  const out = Object.values(state.providerCollections ?? {}).map(
    ({ name, module, export: exported }) => ({ name, module, export: exported })
  )
  for (const [namespace, opted] of Object.entries(
    state.optedInProviders ?? {}
  )) {
    const collections = Object.values(opted.collections ?? {})
    if (collections.length === 0) continue
    const declaration = state.rpc.wireAddonDeclarations.get(namespace)
    const dirs = addonResolutionDirs(rootDir, declaration?.file)
    const packageDir = findInstalledPackageDir(dirs, opted.packageName)
    if (!packageDir) continue
    for (const collection of collections) {
      out.push({
        name: collection.name,
        module: locateProviderModule(
          packageDir,
          collection.module,
          `Collection '${collection.name}' of addon '${namespace}' (${opted.packageName})`
        ),
        export: collection.export,
      })
    }
  }
  return out
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

/** What the PKU399 message lists: the keys core builds for every invocation. */
const CORE_WIRE_KEY_NAMES = 'auditLog, analytics, session, rpc'

/** The keys a per-request provider may find already built by core, sometimes. */
const CORE_HELD_WIRE_KEYS = ['auditLog'] as const

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
  const allSources = collectProviderSources(options.state, options.rootDir)
  const sources = allSources.filter((source) => source.meta.kind !== 'wire')
  const wireSources = allSources.filter((source) => source.meta.kind === 'wire')
  const baselineKeys = new Set(baseline)
  const looked = variantOrder(target, profile)

  const collections = knownCollections(options.state)

  const keysOf = (source: ProviderSource): string[] => {
    if (source.meta.addTo) return []
    const variant = variantFor(source.meta, target, profile)
    return variant
      ? [...source.meta.variants[variant]!.provides]
      : providedKeys(source.meta)
  }

  const owners = new Map<string, ProviderSource>()
  for (const source of sources) {
    for (const key of keysOf(source)) {
      const declaredIn = collections.get(key)
      if (declaredIn !== undefined) {
        throw new ProviderBuildError(
          ErrorCode.COLLECTION_KEY_CONFLICT,
          `'${key}' is the provider collection declared in ${declaredIn}; provider '${source.name}' cannot also provide it as a key.`
        )
      }
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

  const wireOwners = checkLifetimes({
    state: options.state,
    singletons: sources,
    wire: wireSources,
    singletonOwners: owners,
    baseline: baselineKeys,
    collections,
    where,
  })

  const reached = new Set<string>([
    ...options.requiredServices,
    ...(options.factoryServices ?? []),
  ])
  const selected = new Set<ProviderSource>()
  for (let grew = true; grew;) {
    grew = false
    for (const source of allSources) {
      if (selected.has(source)) continue
      const joins = source.meta.addTo
        ? reached.has(source.meta.addTo)
        : source.meta.kind === 'wire'
          ? providedKeys(source.meta).some((key) => reached.has(key))
          : keysOf(source).some((key) => reached.has(key))
      if (!joins) continue
      selected.add(source)
      grew = true
      const variant = variantFor(source.meta, target, profile)
      const read = variant ? source.meta.variants[variant]! : undefined
      for (const need of read?.needs ?? []) {
        if (
          read!.optional?.includes(need) &&
          !owners.has(need) &&
          !wireOwners.has(need) &&
          !collections.has(need)
        )
          continue
        reached.add(need)
      }
    }
  }

  const registry = new ProviderRegistry()
  const byName = new Map<string, ProviderSource>()
  for (const source of sources) {
    if (!selected.has(source)) continue
    const variant = variantFor(source.meta, target, profile)
    if (!variant && source.meta.addTo) continue
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
    registry.add(source.name, definition, meta, {
      kind: 'singleton',
      ...(source.meta.addTo ? { addTo: source.meta.addTo } : {}),
      ...(source.addonScope ? { addon: source.addonScope } : {}),
    })
    byName.set(source.name, source)
  }

  const reachedCollections = [...collections.keys()]
    .filter((name) => reached.has(name))
    .sort()
  for (const name of reachedCollections) registry.collection(name)

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

  const wireResolved = resolveWireProviders({
    sources: wireSources.filter((source) => selected.has(source)),
    state: options.state,
    target,
    profile,
    held: [
      ...baselineKeys,
      ...resolved.flatMap((service) => service.provides),
      ...reachedCollections,
    ],
    where,
    targetLabel,
    looked,
  })

  if (options.functions) {
    checkFunctionNeeds({
      functions: options.functions,
      state: options.state,
      baseline: baselineKeys,
      resolved,
      wireProvided: wireSources.map((source) => source.meta),
      where,
    })
  }

  const importOf = (
    service: { name: string; variant: ProviderVariantName } & Pick<
      ResolvedProviderImport,
      'needs' | 'optional' | 'provides' | 'optionalProvides' | 'addon' | 'addTo'
    > & { onServerStart?: unknown },
    source: ProviderSource
  ): ResolvedProviderImport => ({
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
    ...(service.addon ? { addon: service.addon } : {}),
    ...(service.addTo ? { addTo: service.addTo } : {}),
    onServerStart: Boolean(service.onServerStart),
  })

  return {
    target,
    baseline,
    collections: reachedCollections,
    ordered: resolved.map((service) =>
      importOf(service, byName.get(service.name)!)
    ),
    wire: wireResolved.map(({ service, source }) => importOf(service, source)),
  }
}

/**
 * The lifetime rules, checked on every provider whether a target reaches it or
 * not: a singleton never needs a key built per request (PKU392), a per-request
 * key is never one a singleton holds (PKU393), and core builds some keys for
 * every invocation, which no wire provider may provide (PKU399). Returns the
 * wire providers' keys with the provider that owns each.
 */
const checkLifetimes = ({
  state,
  singletons,
  wire,
  singletonOwners,
  baseline,
  collections,
  where,
}: {
  state: ProvidersState
  singletons: readonly ProviderSource[]
  wire: readonly ProviderSource[]
  singletonOwners: ReadonlyMap<string, ProviderSource>
  baseline: ReadonlySet<string>
  collections: ReadonlyMap<string, string>
  where: string
}): Map<string, ProviderSource> => {
  const wireOwners = new Map<string, ProviderSource>()
  const allKeys = (source: ProviderSource) => providedKeys(source.meta)
  const heldBySingleton = (key: string): string | undefined => {
    const owner = [...singletons].find((source) =>
      allKeys(source).includes(key)
    )
    if (owner) return owner.name
    if (state.projectServicesProvided?.keys.includes(key))
      return 'pikkuServices'
    if (baseline.has(key)) return 'the baseline'
    return undefined
  }
  for (const source of wire) {
    for (const key of allKeys(source)) {
      if ((CORE_PER_REQUEST_KEYS as readonly string[]).includes(key)) {
        throw new ProviderBuildError(
          ErrorCode.CORE_WIRE_KEY_PROVIDED,
          `Wire provider '${source.name}' provides '${key}', which core builds for every invocation (${CORE_WIRE_KEY_NAMES}).`
        )
      }
      const holder = heldBySingleton(key)
      if (holder !== undefined) {
        throw new ProviderBuildError(
          ErrorCode.WIRE_KEY_SHADOWS_SINGLETON,
          `Wire provider '${source.name}' provides '${key}', which '${holder}' already holds as a singleton on ${where}. A key has one lifetime.`
        )
      }
      if (collections.has(key)) {
        throw new ProviderBuildError(
          ErrorCode.COLLECTION_KEY_CONFLICT,
          `'${key}' is the provider collection declared in ${collections.get(key)}; provider '${source.name}' cannot also provide it as a key.`
        )
      }
      const owner = wireOwners.get(key)
      if (owner && owner !== source) {
        throw new ProviderBuildError(
          ErrorCode.PROVIDER_KEY_DUPLICATED,
          `Providers '${owner.name}' and '${source.name}' both provide '${key}' on ${where}. Each key has one provider.`
        )
      }
      wireOwners.set(key, source)
    }
  }
  for (const key of state.projectWireServicesProvided?.keys ?? []) {
    const holder = singletons.find((source) => allKeys(source).includes(key))
    if (holder) {
      throw new ProviderBuildError(
        ErrorCode.WIRE_KEY_SHADOWS_SINGLETON,
        `Wire provider 'createWireServices' provides '${key}', which '${holder.name}' already holds as a singleton on ${where}. A key has one lifetime.`
      )
    }
  }
  for (const source of singletons) {
    for (const variant of Object.values(source.meta.variants)) {
      for (const need of variant?.needs ?? []) {
        const builder = wireOwners.get(need)
        if (builder && !singletonOwners.has(need)) {
          throw new ProviderBuildError(
            ErrorCode.SINGLETON_NEEDS_WIRE_KEY,
            `Provider '${source.name}' is a singleton but needs '${need}', which wire provider '${builder.name}' builds per request. Make '${source.name}' a defineWireProvider, or stop needing '${need}'.`
          )
        }
      }
    }
  }
  return wireOwners
}

/**
 * Picks each per-request provider's variant and orders them, with core's own
 * per-request keys and every singleton the target holds as what they may need.
 */
const resolveWireProviders = ({
  sources,
  state,
  target,
  profile,
  held,
  where,
  targetLabel,
  looked,
}: {
  sources: readonly ProviderSource[]
  state: ProvidersState
  target: ProviderTarget
  profile: ProviderProfile | undefined
  held: readonly string[]
  where: string
  targetLabel: string
  looked: readonly ProviderVariantName[]
}): { service: ResolvedProvider; source: ProviderSource }[] => {
  if (sources.length === 0) return []
  const registry = new ProviderRegistry()
  const byName = new Map<string, ProviderSource>()
  for (const source of sources) {
    const variant = variantFor(source.meta, target, profile)
    if (!variant) {
      throw new ProviderBuildError(
        ErrorCode.PROVIDER_NO_VARIANT,
        `Provider '${source.name}' has no variant for ${where} (looked for ${looked.join(', ')}), so it would run without ${providedKeys(
          source.meta
        )
          .map((key) => `'${key}'`)
          .join(
            ', '
          )}. Give it one of those, or leave it out of ${targetLabel}.`
      )
    }
    const read = source.meta.variants[variant]!
    for (const key of CORE_HELD_WIRE_KEYS) {
      if (read.needs.includes(key) && !read.optional?.includes(key)) {
        throw new ProviderBuildError(
          ErrorCode.PROVIDER_NEEDS_OPTIONAL_KEY,
          `Provider '${source.name}' needs '${key}', which 'core' provides only sometimes. Add '${key}' to its optional list.`
        )
      }
    }
    registry.add(
      source.name,
      { [variant]: noop } as ProviderVariants,
      { [variant]: read } as CoreProviderMeta,
      { kind: 'wire' }
    )
    byName.set(source.name, source)
  }
  const singletonKeys = new Set<string>([
    ...held,
    ...CORE_HELD_WIRE_KEYS,
    ...(state.projectServicesProvided?.keys ?? []),
    ...(state.serviceTypes?.singletonServices ?? []),
  ])
  try {
    return registry
      .resolve(target, {
        baseline: [...singletonKeys],
        profile,
        where,
      })
      .map((service) => ({ service, source: byName.get(service.name)! }))
  } catch (error) {
    throw toBuildError(error)
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
  wireProvided,
  where,
}: {
  functions: readonly FunctionNeeds[]
  state: ProvidersState
  baseline: ReadonlySet<string>
  resolved: readonly {
    provides: readonly string[]
    optionalProvides: readonly string[]
  }[]
  /** Every per-request provider the project declares or opts in to. */
  wireProvided: readonly ProviderMeta[]
  where: string
}): void => {
  const held = new Set<string>([...baseline, ...CORE_PER_REQUEST_KEYS])
  const soft = new Set<string>(state.serviceTypes?.singletonOptional ?? [])
  for (const service of resolved) {
    for (const key of service.provides) held.add(key)
    for (const key of service.optionalProvides) soft.add(key)
  }
  for (const source of wireProvided) {
    for (const variant of Object.values(source.variants)) {
      for (const key of variant?.provides ?? []) held.add(key)
      for (const key of variant?.optionalProvides ?? []) soft.add(key)
    }
  }
  for (const name of knownCollections(state).keys()) held.add(name)
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
