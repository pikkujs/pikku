import type { TypesMap } from '@pikku/inspector'
import type { Logger } from '@pikku/core/services'
import { getFileImportRelativePath } from './file-import-path.js'

export const serializeImportMap = (
  logger: Logger,
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
    } catch {
      logger.warn(
        `Type '${requiredType}' not found in typesMap - skipping import`
      )
      return
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
