import { createHash } from 'node:crypto'

import type { GroupingRule } from '@pikku/deploy'

import { toSafeKebab } from './naming.js'

export type GroupingStrategy = 'function' | 'single' | 'services'

export type { GroupingRule } from '@pikku/deploy'

export interface GroupingConfig {
  /**
   * Defaults to `'services'`: one unit per distinct service combination. The
   * alternatives are `'function'` (one unit per function — the smallest bundles
   * and the most of them) and `'single'` (everything in one).
   */
  strategy?: GroupingStrategy
  rules?: GroupingRule[]
}

export interface UnitResolverInput {
  routesForFunction: (funcId: string) => string[]
  tagsForFunction: (funcId: string) => string[]
  /**
   * The singleton services the function's own body destructures. Only used by
   * `strategy: 'services'`, which keys a unit on this set.
   */
  servicesForFunction: (funcId: string) => string[]
  /**
   * Where the function runs. Part of the `strategy: 'services'` key, because a
   * target is not always implied by the services: a function carrying no
   * serverless-incompatible service can still name `deploy: 'server'` itself,
   * and merging it with a serverless function that happens to build the same
   * services is the one grouping a target refusal exists to stop.
   */
  targetForFunction: (funcId: string) => 'serverless' | 'server'
}

export interface UnitResolver {
  forFunction: (funcId: string) => string
  forAddon: (namespace: string) => string
  isGrouped: boolean
  ruleForUnit: (unitName: string) => GroupingRule | undefined
  /**
   * The service set that named a unit under `strategy: 'services'`, or
   * undefined for a unit that came from a rule or from one-per-function. The
   * manifest's own `services` list cannot stand in for it: that list is keyed
   * by capability, so `workflowService` and `workflowRunService` both arrive as
   * `workflow-state` and two genuinely different units read as identical.
   */
  serviceKeyForUnit: (unitName: string) => string[] | undefined
}

const SINGLE_UNIT_NAME = 'app'

/**
 * One unit per distinct service combination. `'function'` gives a deployment
 * as many units as it has functions, which is a cold start and a deploy step
 * each for bundles that mostly build the same services.
 */
const DEFAULT_STRATEGY: GroupingStrategy = 'services'

/**
 * Services every unit is given regardless of what it holds, so they say nothing
 * about which functions belong together. `config`, `logger`, `variables`,
 * `schema` and `secrets` are written into every generated services map as
 * `defaultServices`; `rpc`, `mcp`, `channel` and `userSession` are the
 * per-request services the inspector already excludes from tree-shaking.
 *
 * Only the base set is subtracted. A service that happens to be app-wide today
 * — `auth` under a declared auth definition, say — is left in the key on
 * purpose: it is constant, so it cannot split a partition, and dropping it
 * would make the unit name lie about what the unit builds.
 */
const BASE_SERVICES = new Set([
  'config',
  'logger',
  'variables',
  'schema',
  'secrets',
  'rpc',
  'mcp',
  'channel',
  'userSession',
])

const SERVICE_UNIT_PREFIX = 'svc'
/** Kept short enough to survive a provider's own name length limits. */
const SERVICE_UNIT_NAME_LIMIT = 58

/**
 * The distinguishing services in a set: what is left once the services every
 * unit gets regardless are removed. This is the grouping key.
 */
export const serviceKey = (services: string[]): string[] =>
  [...new Set(services)].filter((service) => !BASE_SERVICES.has(service)).sort()

/**
 * The unit name for one service set. Names the services themselves so a plan
 * reads as what each unit builds; a set too long to spell out keeps the first
 * few names and a digest of the whole set, which stays stable for that exact
 * set and distinct from every other.
 */
export const serviceUnitName = (
  services: string[],
  target: 'serverless' | 'server' = 'serverless'
): string => {
  const suffix = target === 'server' ? '-server' : ''
  const key = serviceKey(services)
  if (key.length === 0) {
    return `${SERVICE_UNIT_PREFIX}-base${suffix}`
  }

  const full = `${SERVICE_UNIT_PREFIX}-${key.map(toSafeKebab).join('-')}${suffix}`
  if (full.length <= SERVICE_UNIT_NAME_LIMIT) {
    return full
  }

  const digest = createHash('sha256')
    .update(key.join(','))
    .digest('hex')
    .slice(0, 6)
  const room = SERVICE_UNIT_NAME_LIMIT - digest.length - suffix.length - 1
  return `${full.slice(0, room).replace(/-+$/, '')}-${digest}${suffix}`
}

const routeMatcher = (pattern: string): RegExp => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`)
}

export const validateGrouping = (config: GroupingConfig): void => {
  const rules = config.rules ?? []
  const seen = new Set<string>()
  for (const rule of rules) {
    if (!rule.unit) {
      throw new Error(
        `deploy.grouping: every rule needs a "unit" name (offending rule: ${JSON.stringify(rule)})`
      )
    }
    if (seen.has(rule.unit)) {
      throw new Error(
        `deploy.grouping: two rules both name the unit "${rule.unit}". Merge them into one rule.`
      )
    }
    seen.add(rule.unit)
    if (!rule.tags?.length && !rule.addon && !rule.routes?.length) {
      throw new Error(
        `deploy.grouping: rule "${rule.unit}" matches nothing. Give it at least one of "tags", "addon" or "routes".`
      )
    }
  }
}

export const createUnitResolver = (
  config: GroupingConfig | undefined,
  input: UnitResolverInput
): UnitResolver => {
  const strategy = config?.strategy ?? DEFAULT_STRATEGY
  const rules = config?.rules ?? []

  if (config) {
    validateGrouping(config)
  }

  const compiled = rules.map((rule) => ({
    rule,
    unit: toSafeKebab(rule.unit),
    tags: rule.tags,
    addon: rule.addon,
    routes: rule.routes?.map(routeMatcher),
  }))

  const byUnitName = new Map(compiled.map((c) => [c.unit, c.rule]))
  const serviceKeys = new Map<string, string[]>()

  const matches = (
    c: (typeof compiled)[number],
    tags: string[],
    routes: string[],
    addon: string | undefined
  ): boolean => {
    if (c.tags && !c.tags.some((tag) => tags.includes(tag))) {
      return false
    }
    if (c.addon && c.addon !== addon) {
      return false
    }
    if (c.routes && !c.routes.some((re) => routes.some((r) => re.test(r)))) {
      return false
    }
    return true
  }

  const fallback = (funcId: string) => {
    if (strategy === 'single') {
      return SINGLE_UNIT_NAME
    }
    if (strategy === 'services') {
      const services = input.servicesForFunction(funcId)
      const name = serviceUnitName(services, input.targetForFunction(funcId))
      serviceKeys.set(name, serviceKey(services))
      return name
    }
    return toSafeKebab(funcId)
  }

  return {
    isGrouped: strategy !== 'function' || compiled.length > 0,
    ruleForUnit: (unitName) => byUnitName.get(unitName),
    serviceKeyForUnit: (unitName) => serviceKeys.get(unitName),
    forFunction: (funcId) => {
      if (compiled.length > 0) {
        const tags = input.tagsForFunction(funcId)
        const routes = input.routesForFunction(funcId)
        for (const c of compiled) {
          if (matches(c, tags, routes, undefined)) {
            return c.unit
          }
        }
      }
      return fallback(funcId)
    },
    forAddon: (namespace) => {
      for (const c of compiled) {
        if (c.addon === namespace && !c.tags && !c.routes) {
          return c.unit
        }
      }
      return `addon-${toSafeKebab(namespace)}`
    },
  }
}
