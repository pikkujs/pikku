import type {
  ContributorBindingSource,
  ContributorPlatform,
  NamedContributor,
} from './contributors.types.js'

export class ContributorDependencyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContributorDependencyError'
  }
}

export const DEFAULT_CONTRIBUTOR_BINDING_SOURCES: readonly ContributorBindingSource[] =
  ['env']

const satisfies = (provided: string, need: string): boolean =>
  provided === need || need.startsWith(`${provided}.`)

export interface SkippedContributor {
  name: string
  /**
   * `when` returned false; the target cannot supply its `requires` (checked
   * only once `when` passed, so this one is a contributor the build wanted);
   * or it was `optional` and nothing meets a need of it.
   */
  reason: 'when' | 'requires' | 'needs'
}

/**
 * Drops contributors whose `when` is false or whose `requires` the target
 * cannot supply. The clash and ordering checks run on what is left, so an
 * exclusive pair of `when`s never clashes.
 */
export const selectContributors = <T extends NamedContributor<any, any>>(
  contributors: readonly T[],
  options: {
    platform: ContributorPlatform
    supported?: readonly ContributorBindingSource[]
  }
): { selected: T[]; skipped: SkippedContributor[] } => {
  const supported = options.supported ?? DEFAULT_CONTRIBUTOR_BINDING_SOURCES
  const selected: T[] = []
  const skipped: SkippedContributor[] = []
  for (const entry of contributors) {
    const requires =
      entry.contributor.requires ?? DEFAULT_CONTRIBUTOR_BINDING_SOURCES
    // `when` first: a contributor that is not meant for this build is never
    // reported as one the target failed to support.
    if (entry.contributor.when?.(options.platform) === false) {
      skipped.push({ name: entry.name, reason: 'when' })
    } else if (!requires.every((source) => supported.includes(source))) {
      skipped.push({ name: entry.name, reason: 'requires' })
    } else {
      selected.push(entry)
    }
  }
  return { selected, skipped }
}

/**
 * Orders contributors so each runs after every contributor providing one of
 * its `needs`. Contributors without needs keep their input order.
 *
 * Throws a `ContributorDependencyError` for a repeated name, a need nothing
 * provides, a key two contributors both provide, or a cycle. A key listed in
 * `options.runtime` is a baseline service: it meets a need and a contributor
 * may provide it too, replacing it.
 */
export const orderContributors = <T extends NamedContributor<any, any>>(
  contributors: readonly T[],
  options: { runtime?: readonly string[] } = {}
): T[] => {
  const runtime = options.runtime ?? []

  const names = new Set<string>()
  for (const { name } of contributors) {
    if (names.has(name)) {
      throw new ContributorDependencyError(
        `Contributor '${name}' is selected more than once.`
      )
    }
    names.add(name)
  }

  const owners = new Map<string, T>()
  for (const entry of contributors) {
    for (const key of entry.contributor.provides ?? []) {
      const owner = owners.get(key)
      if (owner && owner !== entry) {
        throw new ContributorDependencyError(
          `Contributors '${owner.name}' and '${entry.name}' both provide '${key}'. Each service key has one provider.`
        )
      }
      owners.set(key, entry)
    }
  }

  const dependencies = new Map<T, T[]>()
  for (const entry of contributors) {
    const deps = new Set<T>()
    // A contributor that provides what it needs (`provides: ['x'], needs: ['x']`,
    // even for a baseline x) depends on itself, which is a cycle; a decorator
    // declares empty `provides` and reads x from `services`/`runtime` instead.
    for (const need of entry.contributor.needs ?? []) {
      const providers = contributors.filter((other) =>
        (other.contributor.provides ?? []).some((key) => satisfies(key, need))
      )
      const fromRuntime = runtime.some((key) => satisfies(key, need))
      if (providers.length === 0 && !fromRuntime) {
        const near = contributors
          .filter((other) =>
            (other.contributor.provides ?? []).some((key) =>
              key.startsWith(`${need}.`)
            )
          )
          .map((other) => other.name)
        const hint =
          near.length > 0
            ? ` ${near.join(', ')} provide${near.length === 1 ? 's' : ''} keys under it, but not '${need}' itself.`
            : runtime.length > 0
              ? ` No contributor provides it, and the runtime only has: ${runtime.join(', ')}.`
              : ` No contributor provides it, and this runtime provides none.`
        throw new ContributorDependencyError(
          `Contributor '${entry.name}' needs '${need}', which nothing provides.${hint}`
        )
      }
      for (const provider of providers) deps.add(provider)
    }
    dependencies.set(entry, [...deps])
  }

  const ordered: T[] = []
  const placed = new Set<T>()
  while (ordered.length < contributors.length) {
    const next = contributors.find(
      (entry) =>
        !placed.has(entry) &&
        dependencies.get(entry)!.every((dep) => placed.has(dep))
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

/**
 * Drops, repeatedly, the `optional` contributors whose `needs` nothing left
 * provides, so one that only decorates a service (a wrapper around
 * `services.kysely`) applies when the service exists and is not an error when
 * it does not.
 */
const dropUnmetOptional = <T extends NamedContributor<any, any>>(
  selected: readonly T[],
  optional: ReadonlySet<string>,
  runtime: readonly string[]
): { kept: T[]; dropped: SkippedContributor[] } => {
  let kept = [...selected]
  const dropped: SkippedContributor[] = []
  for (;;) {
    const unmet = kept.find(
      (entry) =>
        optional.has(entry.name) &&
        (entry.contributor.needs ?? []).some(
          (need) =>
            !runtime.some((key) => satisfies(key, need)) &&
            !kept.some(
              (other) =>
                other !== entry &&
                (other.contributor.provides ?? []).some((key) =>
                  satisfies(key, need)
                )
            )
        )
    )
    if (!unmet) return { kept, dropped }
    kept = kept.filter((entry) => entry !== unmet)
    dropped.push({ name: unmet.name, reason: 'needs' })
  }
}

/**
 * Filters by `when`/`requires`, then checks clashes and orders what is left.
 * Names in `optional` are dropped, rather than failing the build, when a need
 * of theirs is met by nothing.
 */
export const resolveContributors = <T extends NamedContributor<any, any>>(
  contributors: readonly T[],
  options: {
    platform: ContributorPlatform
    supported?: readonly ContributorBindingSource[]
    optional?: ReadonlySet<string>
  }
): { ordered: T[]; skipped: SkippedContributor[] } => {
  const { selected, skipped } = selectContributors(contributors, options)
  const { kept, dropped } = dropUnmetOptional(
    selected,
    options.optional ?? new Set(),
    options.platform.runtimeServices ?? []
  )
  return {
    ordered: orderContributors(kept, {
      runtime: options.platform.runtimeServices,
    }),
    skipped: [...skipped, ...dropped],
  }
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
