import type { InspectorFilters } from '@pikku/inspector'

export type CLIFilters = InspectorFilters & {
  excludeNames?: string[]
  excludeTags?: string[]
  excludeDirectories?: string[]
  excludeHttpRoutes?: string[]
  excludeHttpMethods?: string[]
  excludeTarget?: Array<'serverless' | 'server'>
}

/**
 * Parse CLI filter arguments into InspectorFilters format
 */
export function parseCLIFilters(
  data: any,
  cliConfig?: {
    deploy?: {
      serverlessIncompatible?: string[]
      defaultTarget?: 'serverless' | 'server'
    }
    addon?: boolean | { serverlessIncompatible?: string[] }
    namedFilters?: Record<string, InspectorFilters>
  }
): CLIFilters {
  const filters: CLIFilters = {}

  // Backward-compatible escape hatch for raw JSON filter blobs.
  if (data.filters && data.filters.trim().startsWith('{')) {
    return JSON.parse(data.filters)
  }

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
  }

  const namedFilters = cliConfig?.namedFilters ?? {}
  const requestedNamedFilters: string[] | undefined =
    data.filter ?? (data.filters ? [data.filters] : undefined)
  if (requestedNamedFilters && requestedNamedFilters.length > 0) {
    for (const name of requestedNamedFilters) {
      const preset = namedFilters[name]
      if (!preset) {
        const available = Object.keys(namedFilters)
        throw new Error(
          available.length > 0
            ? `Unknown --filter '${name}'. Available filters: ${available.join(', ')}`
            : `Unknown --filter '${name}'. No named filters configured in pikku.config.json`
        )
      }
      mergeFilter(preset)
    }
  }

  mergeFilter({
    names: data.names,
    tags: data.tags,
    wires: data.wires,
    directories: data.directories,
    httpRoutes: data.httpRoutes,
    httpMethods: data.httpMethods,
    target: data.target,
    excludeNames: data.excludeNames,
    excludeTags: data.excludeTags,
    excludeWires: data.excludeWires,
    excludeDirectories: data.excludeDirectories,
    excludeHttpRoutes: data.excludeHttpRoutes,
    excludeHttpMethods: data.excludeHttpMethods,
    excludeTarget: data.excludeTarget,
  })

  const validateTargetList = (
    values: string[] | undefined,
    argName: '--target' | '--exclude-target'
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
    '--target'
  )
  filters.excludeTarget = validateTargetList(
    filters.excludeTarget as string[] | undefined,
    '--exclude-target'
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
    filters.defaultTarget = cliConfig?.deploy?.defaultTarget
  }

  return filters
}
