import { existsSync } from 'node:fs'
import { dirname, join, parse, posix, resolve } from 'node:path'
import {
  resolveContributors,
  type Contributor,
  DEFAULT_CONTRIBUTOR_BINDING_SOURCES,
  type ContributorBindingSource,
  type ContributorPlatform,
  type ContributorTarget,
  type SkippedContributor,
} from '@pikku/core/contributors'
import { addonResolutionDirs } from '@pikku/inspector/lite'
import type { InspectorState } from '@pikku/inspector'
import { loadUserModule } from '../functions/commands/load-user-project.js'

/** A contributor variant an addon recorded and the project opted in to. */
export interface OptedInVariant {
  name: string
  namespace: string
  packageName: string
  /** Absolute directory of the installed addon package. */
  packageDir: string
  /** As the addon recorded it: relative to the package root, posix, `.ts`. */
  module: string
  export: string
}

/** A selected contributor, in run order, with the file a generator imports. */
export interface ResolvedContributor {
  name: string
  /** Absolute path of the module that exports the variant. */
  module: string
  export: string
  hooks: { start: boolean; stop: boolean }
}

export interface ResolvedContributors {
  /** In run order: every contributor runs after the ones providing what it needs. */
  ordered: ResolvedContributor[]
  /** Left out by `when` or `requires`. */
  skipped: SkippedContributor[]
  /** Opted in, but with no variant for this target. */
  withoutVariant: string[]
  /**
   * Selected contributors whose `onServerStop` can never run, because the target
   * does not run the server lifecycle (`runsServerLifecycle: false`). Only a
   * warning: a missed teardown is harmless, unlike a missed `onServerStart`.
   */
  ignoredStopHooks: string[]
}

type OptedInState = Pick<InspectorState, 'optedInContributors'> & {
  rpc: { wireAddonDeclarations: InspectorState['rpc']['wireAddonDeclarations'] }
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
 * Every contributor the project opted in to with `wireAddon({ contributors })`,
 * as the variant for `target`. A contributor with no variant for the target is
 * not an error (an addon may ship a dev-only one), and is returned by name so
 * the caller can say so.
 */
export const optedInVariants = (
  state: OptedInState,
  rootDir: string,
  target: ContributorTarget
): { variants: OptedInVariant[]; withoutVariant: string[] } => {
  const variants: OptedInVariant[] = []
  const withoutVariant: string[] = []
  for (const [namespace, opted] of Object.entries(
    state.optedInContributors ?? {}
  )) {
    const declaration = state.rpc.wireAddonDeclarations.get(namespace)
    const dirs = addonResolutionDirs(rootDir, declaration?.file)
    const packageDir = findInstalledPackageDir(dirs, opted.packageName)
    for (const [name, byTarget] of Object.entries(opted.contributors)) {
      const ref = byTarget[target]
      if (!ref) {
        withoutVariant.push(name)
        continue
      }
      if (!packageDir) {
        throw new Error(
          `wireAddon('${namespace}') opts in to contributor '${name}', but ${opted.packageName} is not installed where it can be resolved from ${dirs.join(' or ')}.`
        )
      }
      variants.push({
        name,
        namespace,
        packageName: opted.packageName,
        packageDir,
        module: ref.module,
        export: ref.export,
      })
    }
  }
  return { variants, withoutVariant }
}

/**
 * The file an addon's recorded module is to be imported from. The inspector
 * records the `.ts` source, which is what a workspace addon (or one that ships
 * its source) has on disk. A published addon ships only its build, so the same
 * path is looked for under `dist/` as `.js`: first keeping the `src/` prefix
 * (`rootDir: "."`, which is what the repo's addons build with), then without it
 * (`rootDir: "src"`).
 */
export const locateContributorModule = (variant: OptedInVariant): string => {
  const source = resolve(variant.packageDir, variant.module)
  if (existsSync(source)) return source
  const asJs = posix.normalize(variant.module).replace(/\.[cm]?tsx?$/, '.js')
  const built = [asJs, asJs.replace(/^src\//, '')]
    .filter((path, index, all) => all.indexOf(path) === index)
    .map((path) => resolve(variant.packageDir, 'dist', path))
  const found = built.find((candidate) => existsSync(candidate))
  if (found) return found
  throw new Error(
    `Contributor '${variant.name}' of addon '${variant.namespace}' (${variant.packageName}) is recorded at ${variant.module}, but none of ${[source, ...built].join(', ')} exists.`
  )
}

/** A contributor the caller selects itself, beside the opted-in ones. */
export interface ExtraContributor {
  name: string
  contributor: Contributor<any, any>
  /** Absolute path of the module that exports it. */
  module: string
  export: string
  /** Left out, not an error, when nothing meets a service it needs. */
  optional?: boolean
}

/**
 * The one resolver for `pikku dev` and every deploy: picks each opted-in
 * contributor's variant for `target`, loads it, drops what `when` or `requires`
 * rules out, then checks clashes and orders what is left. Both `when` and
 * `requires` are evaluated here, at build time; the generated file never sees
 * them.
 *
 * A contributor with no variant for the target is simply not part of it. One
 * the project opted in to whose variant `requires` a binding the target cannot
 * supply is an error naming it: the app was written to use it, so building
 * without it would ship a different app (`when` returning false is the way to
 * say "not here"). `extra` contributors skip the opt-in lookup and are never
 * an error for `requires`.
 *
 * A host may pass a platform widened with its own facts (`unit`, say); only
 * the contributors that declare that type read them.
 */
export const resolveTargetContributors = async <
  TPlatform extends ContributorPlatform,
>(options: {
  state: OptedInState
  rootDir: string
  target: ContributorTarget
  platform: TPlatform
  supported?: readonly ContributorBindingSource[]
  extra?: readonly ExtraContributor[]
  /** Names the target in the unsupported-`requires` error ("the standalone target"). */
  targetLabel?: string
  /**
   * Whether the target runs the server lifecycle (`pikku dev`, a server or
   * container entry) and so calls `onServerStart` / `onServerStop`. Defaults to
   * true. When false, a selected contributor with `onServerStart` is an error
   * (it would silently never run) and one with `onServerStop` is reported in
   * `ignoredStopHooks`.
   */
  runsServerLifecycle?: boolean
  /** Names what is being built in the `onServerStart` error ("unit 'api'"). */
  unitLabel?: string
  load?: (file: string) => Promise<Record<string, any>>
}): Promise<ResolvedContributors> => {
  const load = options.load ?? loadUserModule
  const { variants, withoutVariant } = optedInVariants(
    options.state,
    options.rootDir,
    options.target
  )
  const entries = await Promise.all(
    variants.map(async (variant) => {
      const module = locateContributorModule(variant)
      const loaded = (await load(module))[variant.export] as
        Contributor<any, TPlatform> | undefined
      if (!loaded || typeof loaded.run !== 'function') {
        throw new Error(
          `Contributor '${variant.name}' of addon '${variant.namespace}': '${variant.export}' exported by ${module} is not a contributor (an object with a run function).`
        )
      }
      return { name: variant.name, contributor: loaded, module, variant }
    })
  )
  const extras = (options.extra ?? []).map((extra) => ({
    name: extra.name,
    contributor: extra.contributor as Contributor<any, TPlatform>,
    module: extra.module,
    variant: { export: extra.export } as { export: string } | OptedInVariant,
  }))
  const { ordered, skipped } = resolveContributors([...entries, ...extras], {
    platform: options.platform,
    supported: options.supported,
    optional: new Set(
      (options.extra ?? []).filter((e) => e.optional).map((e) => e.name)
    ),
  })
  const opted = new Map(entries.map((entry) => [entry.name, entry.variant]))
  const unsupported = skipped.filter(
    ({ name, reason }) => reason === 'requires' && opted.has(name)
  )
  if (unsupported.length > 0) {
    const detail = unsupported
      .map(({ name }) => {
        const variant = opted.get(name)!
        const needed = (
          entries.find((entry) => entry.name === name)!.contributor.requires ??
          DEFAULT_CONTRIBUTOR_BINDING_SOURCES
        ).join(', ')
        return `'${name}' of addon '${variant.namespace}' (${variant.packageName}) requires ${needed}`
      })
      .join('; ')
    throw new Error(
      `${options.targetLabel ?? `The ${options.target} target`} cannot supply what ${unsupported.length === 1 ? 'a contributor' : 'contributors'} the project opted in to with wireAddon need${unsupported.length === 1 ? 's' : ''}: ${detail}. Remove it from wireAddon({ contributors }), or give the addon a variant for this target.`
    )
  }
  const runsServerLifecycle = options.runsServerLifecycle ?? true
  if (!runsServerLifecycle) {
    const starting = ordered.filter(
      ({ contributor }) => typeof contributor.onServerStart === 'function'
    )
    if (starting.length > 0) {
      const where = options.unitLabel ? ` in ${options.unitLabel}` : ''
      throw new Error(
        `${options.targetLabel ?? `The ${options.target} target`} does not run the server lifecycle, so onServerStart would never be called: ${starting.map(({ name }) => `contributor '${name}'`).join(', ')}${where}. Remove ${starting.length === 1 ? 'it' : 'them'} from wireAddon({ contributors }), or deploy this unit as a server (container) target.`
      )
    }
  }
  return {
    ignoredStopHooks: runsServerLifecycle
      ? []
      : ordered
          .filter(
            ({ contributor }) => typeof contributor.onServerStop === 'function'
          )
          .map(({ name }) => name),
    ordered: ordered.map(({ name, module, variant, contributor }) => ({
      name,
      module,
      export: variant.export,
      hooks: {
        start: typeof contributor.onServerStart === 'function',
        stop: typeof contributor.onServerStop === 'function',
      },
    })),
    skipped,
    withoutVariant,
  }
}
