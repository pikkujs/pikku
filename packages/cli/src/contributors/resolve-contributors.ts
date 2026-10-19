import { existsSync } from 'node:fs'
import { dirname, join, parse, posix, resolve } from 'node:path'
import {
  resolveContributors,
  type Contributor,
  type ContributorBindingSource,
  type ContributorPlatform,
  type ContributorTarget,
  type SkippedContributor,
} from '@pikku/core/contributors'
import { addonResolutionDirs } from '@pikku/inspector'
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
 * path is looked for under `dist/` as `.js`.
 */
export const locateContributorModule = (variant: OptedInVariant): string => {
  const source = resolve(variant.packageDir, variant.module)
  if (existsSync(source)) return source
  const built = resolve(
    variant.packageDir,
    'dist',
    posix.normalize(variant.module).replace(/\.[cm]?tsx?$/, '.js')
  )
  if (existsSync(built)) return built
  throw new Error(
    `Contributor '${variant.name}' of addon '${variant.namespace}' (${variant.packageName}) is recorded at ${variant.module}, but neither ${source} nor ${built} exists.`
  )
}

/**
 * The one resolver for `pikku dev` and every deploy: picks each opted-in
 * contributor's variant for `target`, loads it, drops what `when` or `requires`
 * rules out, then checks clashes and orders what is left. Both `when` and
 * `requires` are evaluated here, at build time; the generated file never sees
 * them.
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
  const { ordered, skipped } = resolveContributors(entries, {
    platform: options.platform,
    supported: options.supported,
  })
  return {
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
