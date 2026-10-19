import type { EntryGenerationContext } from './provider-adapter.js'

export type BindingSource = 'env' | 'cloudflare'

export interface ContributorPlatform {
  serviceNames: string[]
  needsQueue: boolean
  needsWorkflow: boolean
  needsAgent: boolean
  /**
   * Services the generated entry already holds before any contributor runs.
   * They satisfy a contributor's `needs`, and emitted lines read them as
   * `runtime.<name>`. Undefined means none.
   */
  runtimeServices?: string[]
}

export interface PlatformServiceContributor<
  TPlatform extends ContributorPlatform = ContributorPlatform,
> {
  name: string
  requires?: BindingSource[]
  /**
   * Service keys this contributor reads, either from `runtime` or from
   * `services` set by another contributor. A dotted key (`logSources.stage`)
   * is met by a contributor providing it exactly or providing a prefix of it
   * (`logSources`). Contributors that provide a need run first.
   */
  needs?: string[]
  /** Service keys this contributor sets on `services`. */
  provides?: string[]
  imports?:
    string[] | ((platform: TPlatform, ctx: EntryGenerationContext) => string[])
  emit(args: {
    ctx: EntryGenerationContext
    platform: TPlatform
    isGateway: boolean
  }): string[]
}

export const DEFAULT_BINDING_SOURCES: readonly BindingSource[] = ['env']

export const contributorBindingSources = (
  contributor: PlatformServiceContributor<any>
): readonly BindingSource[] => contributor.requires ?? DEFAULT_BINDING_SOURCES

export const dedupeContributors = <T extends PlatformServiceContributor<any>>(
  contributors: readonly T[] | undefined
): T[] => {
  const byName = new Map<string, T>()
  for (const contributor of contributors ?? []) {
    byName.set(contributor.name, contributor)
  }
  return [...byName.values()]
}

export const partitionContributors = <
  T extends PlatformServiceContributor<any>,
>(
  contributors: readonly T[],
  supported: readonly BindingSource[]
): { supported: T[]; unsupported: T[] } => {
  const ok: T[] = []
  const rejected: T[] = []
  for (const contributor of contributors) {
    const sources = contributorBindingSources(contributor)
    if (sources.every((source) => supported.includes(source))) {
      ok.push(contributor)
    } else {
      rejected.push(contributor)
    }
  }
  return { supported: ok, unsupported: rejected }
}

export const assertContributorsSupported = (
  contributors: readonly PlatformServiceContributor<any>[],
  supported: readonly BindingSource[],
  adapterName: string
): void => {
  const { unsupported } = partitionContributors(contributors, supported)
  if (unsupported.length === 0) return
  const detail = unsupported
    .map(
      (contributor) =>
        `${contributor.name} (requires ${contributorBindingSources(contributor).join(', ')})`
    )
    .join('; ')
  throw new Error(
    `${adapterName} adapter only provides ${supported.join(', ')} bindings; unsupported contributors: ${detail}`
  )
}

export class ContributorDependencyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContributorDependencyError'
  }
}

const satisfies = (provided: string, need: string): boolean =>
  provided === need || need.startsWith(`${provided}.`)

/**
 * Orders contributors so each runs after every contributor providing one of
 * its `needs`. Contributors without needs keep their input order, so a list
 * that declares none comes out unchanged.
 *
 * Throws a `ContributorDependencyError` for a need nothing provides, a key
 * two contributors both provide, or a cycle.
 */
export const orderContributors = <T extends PlatformServiceContributor<any>>(
  contributors: readonly T[],
  options: { runtime?: readonly string[] } = {}
): T[] => {
  const runtime = options.runtime ?? []

  const owners = new Map<string, T>()
  for (const contributor of contributors) {
    for (const key of contributor.provides ?? []) {
      const owner = owners.get(key)
      if (owner && owner !== contributor) {
        throw new ContributorDependencyError(
          `Contributors '${owner.name}' and '${contributor.name}' both provide '${key}'. Each service key has one provider.`
        )
      }
      owners.set(key, contributor)
    }
  }

  const dependencies = new Map<T, T[]>()
  for (const contributor of contributors) {
    const deps = new Set<T>()
    for (const need of contributor.needs ?? []) {
      const providers = contributors.filter((other) =>
        (other.provides ?? []).some((key) => satisfies(key, need))
      )
      const fromRuntime = runtime.some((key) => satisfies(key, need))
      if (providers.length === 0 && !fromRuntime) {
        const near = contributors
          .filter((other) =>
            (other.provides ?? []).some((key) => key.startsWith(`${need}.`))
          )
          .map((other) => other.name)
        const hint =
          near.length > 0
            ? ` ${near.join(', ')} provide${near.length === 1 ? 's' : ''} keys under it, but not '${need}' itself.`
            : runtime.length > 0
              ? ` No contributor provides it, and the runtime only has: ${runtime.join(', ')}.`
              : ` No contributor provides it, and this runtime provides none.`
        throw new ContributorDependencyError(
          `Contributor '${contributor.name}' needs '${need}', which nothing provides.${hint}`
        )
      }
      for (const provider of providers) deps.add(provider)
    }
    dependencies.set(contributor, [...deps])
  }

  const ordered: T[] = []
  const placed = new Set<T>()
  while (ordered.length < contributors.length) {
    const next = contributors.find(
      (contributor) =>
        !placed.has(contributor) &&
        dependencies.get(contributor)!.every((dep) => placed.has(dep))
    )
    if (!next) {
      throw new ContributorDependencyError(
        `Contributors depend on each other in a cycle: ${findCycle(
          contributors.filter((c) => !placed.has(c)),
          dependencies
        )
          .map((c) => c.name)
          .join(' -> ')}`
      )
    }
    placed.add(next)
    ordered.push(next)
  }
  return ordered
}

const findCycle = <T>(remaining: T[], dependencies: Map<T, T[]>): T[] => {
  const pending = new Set(remaining)
  const visit = (node: T, path: T[]): T[] | undefined => {
    const at = path.indexOf(node)
    if (at >= 0) return [...path.slice(at), node]
    for (const dep of dependencies.get(node) ?? []) {
      if (!pending.has(dep)) continue
      const cycle = visit(dep, [...path, node])
      if (cycle) return cycle
    }
    return undefined
  }
  for (const node of remaining) {
    const cycle = visit(node, [])
    if (cycle) return cycle
  }
  return remaining
}

export const collectContributorImports = <
  TPlatform extends ContributorPlatform,
>(
  contributors: readonly PlatformServiceContributor<TPlatform>[],
  platform: TPlatform,
  ctx: EntryGenerationContext
): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const contributor of orderContributors(contributors, {
    runtime: platform.runtimeServices,
  })) {
    const lines =
      typeof contributor.imports === 'function'
        ? contributor.imports(platform, ctx)
        : (contributor.imports ?? [])
    for (const line of lines) {
      if (!seen.has(line)) {
        seen.add(line)
        out.push(line)
      }
    }
  }
  return out
}

export const collectContributorLines = <TPlatform extends ContributorPlatform>(
  contributors: readonly PlatformServiceContributor<TPlatform>[],
  args: { ctx: EntryGenerationContext; platform: TPlatform; isGateway: boolean }
): string[] => {
  const out: string[] = []
  for (const contributor of orderContributors(contributors, {
    runtime: args.platform.runtimeServices,
  })) {
    const lines = contributor.emit(args)
    if (lines.length > 0) out.push(...lines)
  }
  return out
}
