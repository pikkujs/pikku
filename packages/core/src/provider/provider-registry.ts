import { ProviderError } from './provider-error.js'
import type {
  ProviderDefinition,
  ProviderFactory,
  ProviderMeta,
  ProviderProfile,
  ProviderTarget,
  ProviderVariantName,
  ResolvedProvider,
} from './provider.types.js'

const TARGETS: readonly ProviderTarget[] = ['dev', 'deploy']

interface Entry {
  name: string
  definition: ProviderDefinition
  meta: ProviderMeta
}

/** The variants a target looks for, most specific first. */
export const variantOrder = (
  target: ProviderTarget,
  profile?: ProviderProfile
): ProviderVariantName[] =>
  target === 'deploy'
    ? [...(profile ? [`deploy:${profile}` as const] : []), 'deploy', 'common']
    : [target, 'common']

const variantFor = (
  entry: Entry,
  target: ProviderTarget,
  profile: ProviderProfile | undefined
): { variant: ProviderVariantName; factory: ProviderFactory } | undefined => {
  const { definition } = entry
  if (typeof definition === 'function') {
    return { variant: 'common', factory: definition }
  }
  for (const variant of variantOrder(target, profile)) {
    const factory = definition[variant]
    if (factory) return { variant, factory }
  }
  return undefined
}

const capitalise = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)

/** Options every resolution takes. */
export interface ProviderResolveOptions {
  /** Keys held before any provider runs. */
  baseline?: readonly string[]
  /** The deploy runtime, which picks a `deploy:<profile>` variant over `deploy`. */
  profile?: ProviderProfile
  /** Keys the entry opens itself: a provider that provides one is an error. */
  entryOwned?: readonly string[]
  /** Names the build in errors: `pikku dev`, `the standalone deploy`. Defaults to the target. */
  where?: string
}

/**
 * The services a project registered, with what the inspector read of each.
 * Resolves them per target: picks the variant, checks every dependency is met
 * and every key has one provider, and orders them so a service runs after the
 * services it depends on.
 */
export class ProviderRegistry {
  private readonly entries: Entry[] = []

  /** Registers one provider. `meta` is the inspector's reading of each variant the definition has. */
  add(name: string, definition: ProviderDefinition, meta: ProviderMeta): this {
    if (this.entries.some((entry) => entry.name === name)) {
      throw new ProviderError(
        'duplicate-name',
        `Provider '${name}' is registered more than once.`
      )
    }
    this.entries.push({ name, definition, meta })
    return this
  }

  get names(): string[] {
    return this.entries.map((entry) => entry.name)
  }

  /**
   * The services for one target, in the order they run. A service with no
   * variant for the target is left out. A key in `options.baseline` is already
   * held before any service runs: it meets a need, and one service may provide
   * it too, replacing it.
   *
   * Throws a `ProviderError` for a key two services provide, a need
   * nothing meets, or a cycle.
   */
  resolve(
    target: ProviderTarget,
    options: ProviderResolveOptions = {}
  ): ResolvedProvider[] {
    const baseline = new Set(options.baseline ?? [])
    const entryOwned = new Set(options.entryOwned ?? [])
    const where = options.where ?? target
    const picked: ResolvedProvider[] = []
    for (const entry of this.entries) {
      const chosen = variantFor(entry, target, options.profile)
      if (!chosen) continue
      const meta = entry.meta[chosen.variant]
      if (!meta) {
        throw new ProviderError(
          'unsatisfied-need',
          `Provider '${entry.name}' has a ${chosen.variant} variant the inspector did not read.`
        )
      }
      const definition = entry.definition
      picked.push({
        name: entry.name,
        variant: chosen.variant,
        needs: meta.needs,
        optional: meta.optional ?? [],
        provides: meta.provides,
        optionalProvides: meta.optionalProvides ?? [],
        factory: chosen.factory,
        onServerStart:
          typeof definition === 'function'
            ? undefined
            : definition.onServerStart,
      })
    }

    const owners = new Map<string, ResolvedProvider>()
    for (const service of picked) {
      for (const key of service.provides) {
        const owner = owners.get(key)
        if (owner && owner !== service) {
          throw new ProviderError(
            'duplicate-provider',
            `Providers '${owner.name}' and '${service.name}' both provide '${key}' on ${where}. Each key has one provider.`
          )
        }
        if (entryOwned.has(key)) {
          throw new ProviderError(
            'entry-owned',
            `${capitalise(where)} opens its own '${key}'; provider '${service.name}' cannot replace it. Give '${service.name}' no variant for this target (for a database addon: no deploy:standalone variant).`
          )
        }
        owners.set(key, service)
      }
    }

    const deps = new Map<ResolvedProvider, Set<ResolvedProvider>>()
    for (const service of picked) {
      const set = new Set<ResolvedProvider>()
      for (const need of service.needs) {
        const owner = owners.get(need)
        const optional = service.optional.includes(need)
        if (owner && owner !== service) {
          if (owner.optionalProvides.includes(need) && !optional) {
            throw new ProviderError(
              'optional-key-needed',
              `Provider '${service.name}' needs '${need}', which '${owner.name}' provides only sometimes. Add '${need}' to its optional list.`
            )
          }
          set.add(owner)
        } else if (!baseline.has(need) && !optional) {
          const hint = owner
            ? ` It provides '${need}' itself, which is not available to its own factory.`
            : baseline.size > 0
              ? ` No provider provides it, and the baseline only has: ${[...baseline].join(', ')}.`
              : ' No provider provides it, and there is no baseline.'
          throw new ProviderError(
            'unsatisfied-need',
            `Provider '${service.name}' needs '${need}' on ${where}, which nothing provides.${hint} List it in optional if the provider works without it.`
          )
        }
      }
      deps.set(service, set)
    }

    const ordered: ResolvedProvider[] = []
    const placed = new Set<ResolvedProvider>()
    while (ordered.length < picked.length) {
      const next = picked.find(
        (service) =>
          !placed.has(service) &&
          [...deps.get(service)!].every((dep) => placed.has(dep))
      )
      if (!next) {
        throw new ProviderError(
          'cycle',
          `Providers depend on each other in a cycle on ${where}: ${findCycle(
            picked.filter((service) => !placed.has(service)),
            deps
          )
            .map((service) => service.name)
            .join(' -> ')}`
        )
      }
      placed.add(next)
      ordered.push(next)
    }
    return ordered
  }

  /** Resolves every target, so a service that fails on one of them is a build error. */
  resolveAll(
    options: ProviderResolveOptions = {}
  ): Record<ProviderTarget, ResolvedProvider[]> {
    const out = {} as Record<ProviderTarget, ResolvedProvider[]>
    for (const target of TARGETS) out[target] = this.resolve(target, options)
    return out
  }
}

const findCycle = <T>(remaining: T[], deps: Map<T, Set<T>>): T[] => {
  const pending = new Set(remaining)
  const visit = (node: T, path: T[]): T[] | undefined => {
    const at = path.indexOf(node)
    if (at >= 0) return [...path.slice(at), node]
    for (const dep of deps.get(node) ?? []) {
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
