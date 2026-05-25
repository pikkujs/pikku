import type { InspectorFilters } from '@pikku/inspector'

export type CLIFilters = InspectorFilters & {
  excludeNames?: string[]
  excludeTags?: string[]
  excludeTypes?: string[]
  excludeDirectories?: string[]
  excludeHttpRoutes?: string[]
  excludeHttpMethods?: string[]
  excludeTarget?: Array<'serverless' | 'server'>
}

/**
 * Parse a comma-separated string or array into an array of trimmed, non-empty strings
 * Returns undefined if the input is empty/undefined or results in an empty array
 */
function parseCommaSeparated(
  value: string | string[] | undefined
): string[] | undefined {
  if (!value) return undefined

  if (Array.isArray(value)) {
    const flattened = value
      .flatMap((item) => item.split(','))
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
    return flattened.length > 0 ? flattened : undefined
  }

  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

  return parsed.length > 0 ? parsed : undefined
}

/**
 * Parse CLI filter arguments into InspectorFilters format
 */
export function parseCLIFilters(
  data: any,
  cliConfig?: {
    deploy?: { serverlessIncompatible?: string[] }
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
    append('types', source.types)
    append('directories', source.directories)
    append('httpRoutes', source.httpRoutes)
    append('httpMethods', source.httpMethods)
    append('target', source.target as string[] | undefined)

    append('excludeNames', source.excludeNames)
    append('excludeTags', source.excludeTags)
    append('excludeTypes', source.excludeTypes)
    append('excludeDirectories', source.excludeDirectories)
    append('excludeHttpRoutes', source.excludeHttpRoutes)
    append('excludeHttpMethods', source.excludeHttpMethods)
    append('excludeTarget', source.excludeTarget as string[] | undefined)
  }

  const namedFilters = cliConfig?.namedFilters ?? {}
  const requestedNamedFilters = parseCommaSeparated(data.filter ?? data.filters)
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
    names: parseCommaSeparated(data.names),
    tags: parseCommaSeparated(data.tags),
    types: parseCommaSeparated(data.types),
    directories: parseCommaSeparated(data.directories),
    httpRoutes: parseCommaSeparated(data.httpRoutes),
    httpMethods: parseCommaSeparated(data.httpMethods),
    target: parseCommaSeparated(data.target) as Array<'serverless' | 'server'>,
    excludeNames: parseCommaSeparated(data.excludeNames),
    excludeTags: parseCommaSeparated(data.excludeTags),
    excludeTypes: parseCommaSeparated(data.excludeTypes),
    excludeDirectories: parseCommaSeparated(data.excludeDirectories),
    excludeHttpRoutes: parseCommaSeparated(data.excludeHttpRoutes),
    excludeHttpMethods: parseCommaSeparated(data.excludeHttpMethods),
    excludeTarget: parseCommaSeparated(data.excludeTarget) as Array<
      'serverless' | 'server'
    >,
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
    filters.serverlessIncompatible = cliConfig?.deploy?.serverlessIncompatible
  }

  return filters
}
