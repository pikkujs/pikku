import type { InspectorFilters } from '@pikku/inspector'
import { resolveDeploy } from '../deploy/resolve-deploy.js'

export type CLIFilters = InspectorFilters & {
  excludeNames?: string[]
  excludeTags?: string[]
  excludeDirectories?: string[]
  excludeHttpRoutes?: string[]
  excludeHttpMethods?: string[]
  excludeTarget?: Array<'serverless' | 'server'>
}

/**
 * Resolve the filter a run applies.
 *
 * The only source of filtering is config: the selected backend's `filter`.
 * `names` and `workflowMeta` are not user flags; per-unit deploy codegen passes
 * them when it re-executes `pikku all` for one deployment unit.
 */
export function parseCLIFilters(
  data: { names?: string[]; workflowMeta?: string[] },
  cliConfig?: {
    deploy?: {
      serverlessIncompatible?: string[]
      target?: 'serverless' | 'server'
    }
    addon?: boolean | { serverlessIncompatible?: string[] }
    backends?: Record<
      string,
      {
        filter?: CLIFilters
        deploy?: { target?: 'serverless' | 'server' }
      }
    >
  },
  backend?: string
): CLIFilters {
  const filters: CLIFilters = {}

  const mergeFilter = (source: CLIFilters | undefined) => {
    if (!source) return
    const append = (key: keyof CLIFilters, values?: string[]) => {
      if (!values || values.length === 0) return
      const existing = (filters as any)[key] as string[] | undefined
      ;(filters as any)[key] = [...(existing ?? []), ...values]
    }

    append('names', source.names)
    append('tags', source.tags)
    append('wires', source.wires)
    append('directories', source.directories)
    append('httpRoutes', source.httpRoutes)
    append('httpMethods', source.httpMethods)
    append('target', source.target as string[] | undefined)

    append('excludeNames', source.excludeNames)
    append('excludeTags', source.excludeTags)
    append('excludeWires', source.excludeWires)
    append('excludeDirectories', source.excludeDirectories)
    append('excludeHttpRoutes', source.excludeHttpRoutes)
    append('excludeHttpMethods', source.excludeHttpMethods)
    append('excludeTarget', source.excludeTarget as string[] | undefined)
    append('workflowMeta', source.workflowMeta)
  }

  if (backend) {
    const declared = cliConfig?.backends ?? {}
    const entry = declared[backend]
    if (!entry) {
      throw new Error(
        `Unknown backend '${backend}'. Declared backends: ${Object.keys(declared).join(', ') || '(none)'}`
      )
    }
    mergeFilter(entry.filter)
  }

  mergeFilter({ names: data.names, workflowMeta: data.workflowMeta })

  const validateTargetList = (
    values: string[] | undefined,
    argName: 'filter.target' | 'filter.excludeTarget'
  ): Array<'serverless' | 'server'> | undefined => {
    if (!values || values.length === 0) return undefined
    const invalid = values.filter((t) => t !== 'serverless' && t !== 'server')
    if (invalid.length > 0) {
      throw new Error(
        `Invalid ${argName} value(s): [${invalid.join(', ')}]. Allowed: 'serverless', 'server'.`
      )
    }
    return values as Array<'serverless' | 'server'>
  }

  filters.target = validateTargetList(
    filters.target as string[] | undefined,
    'filter.target'
  )
  filters.excludeTarget = validateTargetList(
    filters.excludeTarget as string[] | undefined,
    'filter.excludeTarget'
  )
  if (filters.target || filters.excludeTarget) {
    const addonIncompatible =
      cliConfig?.addon && typeof cliConfig.addon === 'object'
        ? (cliConfig.addon.serverlessIncompatible ?? [])
        : []
    const merged = [
      ...(cliConfig?.deploy?.serverlessIncompatible ?? []),
      ...addonIncompatible,
    ]
    filters.serverlessIncompatible = merged.length > 0 ? merged : undefined
    // A function with no explicit target counts as the target its backend
    // deploys as, so a filter on `target` and the deploy agree on it.
    filters.defaultTarget = resolveDeploy(
      cliConfig ?? {},
      backend ? { backend } : undefined
    ).target
  }

  return filters
}
