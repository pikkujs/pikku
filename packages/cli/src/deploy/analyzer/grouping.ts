import type { GroupingRule } from '@pikku/deploy'

import { toSafeKebab } from './naming.js'

export type GroupingStrategy = 'function' | 'single'

export type { GroupingRule } from '@pikku/deploy'

export interface GroupingConfig {
  strategy?: GroupingStrategy
  rules?: GroupingRule[]
}

export interface UnitResolverInput {
  routesForFunction: (funcId: string) => string[]
  tagsForFunction: (funcId: string) => string[]
}

export interface UnitResolver {
  forFunction: (funcId: string) => string
  forAddon: (namespace: string) => string
  isGrouped: boolean
  ruleForUnit: (unitName: string) => GroupingRule | undefined
}

const SINGLE_UNIT_NAME = 'app'

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
  const strategy = config?.strategy ?? 'function'
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

  const fallback = (funcId: string) =>
    strategy === 'single' ? SINGLE_UNIT_NAME : toSafeKebab(funcId)

  return {
    isGrouped: strategy !== 'function' || compiled.length > 0,
    ruleForUnit: (unitName) => byUnitName.get(unitName),
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
