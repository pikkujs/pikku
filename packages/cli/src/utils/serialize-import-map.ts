import { TypesMap } from '@pikku/inspector'
import { getFileImportRelativePath } from './file-import-path.js'

export const serializeImportMap = (
  relativeToPath: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap,
  requiredTypes: Set<string>
) => {
  const paths = new Map<string, string[]>()
  Array.from(requiredTypes).forEach((requiredType) => {
    let originalName, uniqueName, path

    try {
      const typeMeta = typesMap.getTypeMeta(requiredType)
      originalName = typeMeta.originalName
      uniqueName = typeMeta.uniqueName
      path = typeMeta.path
    } catch (e) {
      // Handle missing types by trying to find a suitable import path
      // Look through all existing types in the map to find a path that might contain this type
      let foundPath: string | null = null

      // Get all unique paths from the typesMap
      const allPaths = new Set<string>()
      typesMap.customTypes.forEach(({ type, references }) => {
        references.forEach((ref) => {
          try {
            const refMeta = typesMap.getTypeMeta(ref)
            if (refMeta.path) {
              allPaths.add(refMeta.path)
            }
          } catch {
            // Continue
          }
        })
      })

      // Also check direct types in the map
      try {
        const mapEntries = (typesMap as any).map?.entries?.() || []
        for (const [_, typeMeta] of mapEntries) {
          if (typeMeta.path) {
            allPaths.add(typeMeta.path)
          }
        }
      } catch {
        // Continue
      }

      // For PascalCase types, prefer paths that look like type definition files
      if (/^[A-Z]/.test(requiredType)) {
        for (const candidatePath of allPaths) {
          if (
            candidatePath.includes('types') ||
            candidatePath.includes('.d.')
          ) {
            foundPath = candidatePath
            break
          }
        }

        // If no types file found, use the first available path
        if (!foundPath && allPaths.size > 0) {
          foundPath = Array.from(allPaths)[0] || null
        }
      }

      if (foundPath) {
        originalName = requiredType
        uniqueName = requiredType
        path = foundPath
      } else {
        // No suitable path found, skip
        return
      }
    }

    if (!path) {
      // This is a custom type that exists in file, so we don't need to import it
      return
    }
    const variables = paths.get(path) || []

    const importName =
      originalName === uniqueName
        ? originalName
        : `${originalName} as ${uniqueName}`
    if (!variables.includes(importName)) {
      variables.push(importName)
    }
    paths.set(path, variables)
  })

  const imports: string[] = []
  for (const [path, variables] of paths.entries()) {
    imports.push(
      `import type { ${variables.join(', ')} } from '${getFileImportRelativePath(relativeToPath, path, packageMappings)}'`
    )
  }
  return imports.join('\n')
}
