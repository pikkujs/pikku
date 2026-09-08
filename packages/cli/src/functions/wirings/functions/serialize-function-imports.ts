import { join } from 'node:path'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import type { FunctionsMeta } from '@pikku/core/services'

/** Directory, relative to the combined registration file, holding the per-function ones. */
export const SINGLE_FUNCTION_DIR = 'single'

export const serializeFunctionImports = (
  outputPath: string,
  functionsMap: Map<string, { path: string; exportedName: string }>,
  functionsMeta: FunctionsMeta,
  packageMappings: Record<string, string> = {},
  /** Package name for addon packages (e.g., '@pikku/templates-function-addon') */
  addonName?: string
) => {
  const serializedImports: string[] = [
    `/* Import and register functions used by RPCs */`,
    `import { addFunction } from '@pikku/core/function'`,
  ]

  const serializedRegistrations: string[] = []

  // Sort by function name for consistent output, only include functions in meta
  const sortedEntries = Array.from(functionsMap.entries())
    .filter(([name]) => name in functionsMeta)
    .sort((a, b) => a[0].localeCompare(b[0]))

  // Third argument to addFunction is the package name (null for main package)
  const packageArg = addonName ? `, '${addonName}'` : ''

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

/**
 * One registration file per function, so a consumer can bundle a single addon
 * function instead of the package's whole registration module.
 *
 * The combined file stays alongside these — a project on an older addon build,
 * or one that wants every function, still imports that.
 */
export const serializeSingleFunctionImports = (
  outputDir: string,
  functionsMap: Map<string, { path: string; exportedName: string }>,
  functionsMeta: FunctionsMeta,
  packageMappings: Record<string, string> = {},
  addonName?: string
): Map<string, string> => {
  const files = new Map<string, string>()
  for (const [name, entry] of functionsMap) {
    if (!(name in functionsMeta)) continue
    const outputPath = join(outputDir, `${name}.gen.ts`)
    files.set(
      outputPath,
      serializeFunctionImports(
        outputPath,
        new Map([[name, entry]]),
        functionsMeta,
        packageMappings,
        addonName
      )
    )
  }
  return files
}
