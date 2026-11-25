import { ProviderError } from './provider-error.js'
import type {
  ProviderDefinition,
  ProviderFactory,
  ProviderMeta,
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

const variantFor = (
  entry: Entry,
  target: ProviderTarget
): { variant: ProviderVariantName; factory: ProviderFactory } | undefined => {
  const { definition } = entry
  if (typeof definition === 'function') {
    return { variant: 'common', factory: definition }
  }
  const own = definition[target]
  if (own) return { variant: target, factory: own }
  if (definition.common)
    return { variant: 'common', factory: definition.common }
  return undefined
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
    options: { baseline?: readonly string[] } = {}
  ): ResolvedProvider[] {
    const baseline = new Set(options.baseline ?? [])
    const picked: ResolvedProvider[] = []
    for (const entry of this.entries) {
      const chosen = variantFor(entry, target)
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
        provides: meta.provides,
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
            `Providers '${owner.name}' and '${service.name}' both provide '${key}' on ${target}. Each key has one provider.`
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
        if (owner && owner !== service) {
          set.add(owner)
        } else if (!baseline.has(need)) {
          const hint = owner
            ? ` It provides '${need}' itself, which is not available to its own factory.`
            : baseline.size > 0
              ? ` No provider provides it, and the baseline only has: ${[...baseline].join(', ')}.`
              : ' No provider provides it, and there is no baseline.'
          throw new ProviderError(
            'unsatisfied-need',
            `Provider '${service.name}' needs '${need}' on ${target}, which nothing provides.${hint}`
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
          `Providers depend on each other in a cycle on ${target}: ${findCycle(
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
    options: { baseline?: readonly string[] } = {}
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
