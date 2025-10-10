import { InspectorFilters, InspectorLogger } from '../types.js'
import { PikkuWiringTypes } from '@pikku/core'

export const matchesFilters = (
  filters: InspectorFilters,
  params: { tags?: string[] },
  meta: {
    type: PikkuWiringTypes
    name: string
    filePath?: string
  },
  logger: InspectorLogger
) => {
  // If no filters are provided, allow everything
  if (Object.keys(filters).length === 0) {
    return true
  }

  // If all filter arrays are empty, allow everything
  if (
    (!filters.tags || filters.tags.length === 0) &&
    (!filters.types || filters.types.length === 0) &&
    (!filters.directories || filters.directories.length === 0)
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

  return true
}
