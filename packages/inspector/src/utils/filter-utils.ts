import { InspectorFilters, InspectorLogger } from '../types.js'
import { PikkuWiringTypes } from '@pikku/core'

/**
 * Match a value against a pattern with wildcard support
 * Supports "*" suffix only (e.g., "email-*" matches "email-worker", "email-sender")
 * The wildcard requires at least one character after the prefix, unless the pattern is just '*'.
 * @param value - The value to check
 * @param pattern - The pattern with optional "*" suffix
 */
export function matchesWildcard(value: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1)
    // If pattern is just '*', match everything
    if (prefix === '') {
      return true
    }
    // Otherwise, value must start with prefix AND be longer than prefix
    return value.startsWith(prefix) && value.length > prefix.length
  }
  return value === pattern
}

export const matchesFilters = (
  filters: InspectorFilters,
  params: {
    tags?: string[]
    name?: string // Wire/function name for name filter
  },
  meta: {
    type: PikkuWiringTypes
    name: string
    filePath?: string
    httpRoute?: string // For HTTP route filtering
    httpMethod?: string // For HTTP method filtering
  },
  logger: InspectorLogger
) => {
  // If no filters are provided, allow everything
  if (Object.keys(filters).length === 0) {
    return true
  }

  // If all filter arrays are empty, allow everything
  if (
    (!filters.names || filters.names.length === 0) &&
    (!filters.tags || filters.tags.length === 0) &&
    (!filters.types || filters.types.length === 0) &&
    (!filters.directories || filters.directories.length === 0) &&
    (!filters.httpRoutes || filters.httpRoutes.length === 0) &&
    (!filters.httpMethods || filters.httpMethods.length === 0)
  ) {
    return true
  }

  // Check type filter
  if (filters.types && filters.types.length > 0) {
    if (!filters.types.includes(meta.type)) {
      logger.debug(`⒡ Filtered by type: ${meta.type}:${meta.name}`)
      return false
    }
  }

  // Check directory filter
  if (filters.directories && filters.directories.length > 0) {
    if (!meta.filePath) {
      logger.debug(
        `⒡ Filtered by directory: ${meta.type}:${meta.name} (${meta.filePath})`
      )
      return false
    }

    const matchesDirectory = filters.directories.some((dir) => {
      // Normalize paths for comparison
      const normalizedFilePath = meta.filePath!.replace(/\\/g, '/')
      const normalizedDir = dir.replace(/\\/g, '/')
      return normalizedFilePath.includes(normalizedDir)
    })

    if (!matchesDirectory) {
      logger.debug(
        `⒡ Filtered by directory: ${meta.type}:${meta.name} (${meta.filePath})`
      )
      return false
    }
  }

  // Check tag filter
  if (filters.tags && filters.tags.length > 0) {
    if (
      !params.tags ||
      !filters.tags.some((tag) => params.tags!.includes(tag))
    ) {
      logger.debug(`⒡ Filtered by tags: ${meta.type}:${meta.name}`)
      return false
    }
  }

  // Check name filter (with wildcard support)
  if (filters.names && filters.names.length > 0) {
    const nameToMatch = params.name || meta.name
    const nameMatches = filters.names.some((pattern) =>
      matchesWildcard(nameToMatch, pattern)
    )
    if (!nameMatches) {
      logger.debug(`⒡ Filtered by name: ${meta.type}:${meta.name}`)
      return false
    }
  }

  // Check HTTP route filter (with wildcard support)
  if (filters.httpRoutes && filters.httpRoutes.length > 0 && meta.httpRoute) {
    const routeMatches = filters.httpRoutes.some((pattern) =>
      matchesWildcard(meta.httpRoute!, pattern)
    )
    if (!routeMatches) {
      logger.debug(`⒡ Filtered by HTTP route: ${meta.httpRoute}`)
      return false
    }
  }

  // Check HTTP method filter
  if (
    filters.httpMethods &&
    filters.httpMethods.length > 0 &&
    meta.httpMethod
  ) {
    const normalizedMethod = meta.httpMethod.toUpperCase()
    if (!filters.httpMethods.includes(normalizedMethod)) {
      logger.debug(`⒡ Filtered by HTTP method: ${meta.httpMethod}`)
      return false
    }
  }

  return true
}
