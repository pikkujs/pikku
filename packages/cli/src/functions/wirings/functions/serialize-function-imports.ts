import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { FunctionsMeta } from '@pikku/core'

export const serializeFunctionImports = (
  outputPath: string,
  functionsMap: Map<string, { path: string; exportedName: string }>,
  functionsMeta: FunctionsMeta,
  packageMappings: Record<string, string> = {},
  /** Package name for external packages (e.g., '@pikku/templates-function-external') */
  externalPackageName?: string
) => {
  const serializedImports: string[] = [
    `/* Import and register functions used by RPCs */`,
    `import { addFunction } from '@pikku/core'`,
  ]

  const serializedRegistrations: string[] = []

  // Sort by function name for consistent output
  const sortedEntries = Array.from(functionsMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )

  // Third argument to addFunction is the package name (null for main package)
  const packageArg = externalPackageName ? `, '${externalPackageName}'` : ''

  const usedAliases = new Set<string>()

  for (const [name, { path, exportedName }] of sortedEntries) {
    const filePath = getFileImportRelativePath(
      outputPath,
      path,
      packageMappings
    )

    if (name === exportedName) {
      usedAliases.add(exportedName)
      serializedImports.push(`import { ${exportedName} } from '${filePath}'`)
      serializedRegistrations.push(
        `addFunction('${name}', ${exportedName}${packageArg})`
      )
    } else {
      let safeAlias = name.replace(/[^a-zA-Z0-9_$]/g, '_')
      let suffix = 2
      while (usedAliases.has(safeAlias)) {
        safeAlias = `${name.replace(/[^a-zA-Z0-9_$]/g, '_')}_${suffix++}`
      }
      usedAliases.add(safeAlias)
      serializedImports.push(
        `import { ${exportedName} as ${safeAlias} } from '${filePath}'`
      )
      serializedRegistrations.push(
        `addFunction('${name}', ${safeAlias}${packageArg})`
      )
    }
  }

  // Add a blank line between imports and registrations
  if (serializedImports.length > 0 && serializedRegistrations.length > 0) {
    serializedImports.push('')
  }

  // Combine the imports and registrations
  return [...serializedImports, ...serializedRegistrations].join('\n')
}
