import {
  getFileImportRelativePath,
  logCommandInfoAndTime,
  writeFileInDir,
} from '../../utils.js'
import { PikkuCommand } from '../../types.js'
import { FunctionsMeta } from '@pikku/core'

export const serializeFunctionImports = (
  outputPath: string,
  functionsMap: Map<string, { path: string; exportedName: string }>,
  functionsMeta: FunctionsMeta,
  packageMappings: Record<string, string> = {}
) => {
  const serializedImports: string[] = [
    `/* Import and register RPCs */`,
    `import { addFunction } from '@pikku/core'`,
  ]

  const serializedRegistrations: string[] = []

  // Sort by function name for consistent output
  const sortedEntries = Array.from(functionsMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )

  for (const [name, { path, exportedName }] of sortedEntries) {
    const filePath = getFileImportRelativePath(
      outputPath,
      path,
      packageMappings
    )

    // Find the function metadata to check if it's a direct function
    // The functionsMeta is keyed by the function name (exported name)
    const funcMeta = functionsMeta[name]
    const isDirectFunction = funcMeta?.isDirectFunction ?? false

    // For directly exported functions, we can just import and register them
    if (name === exportedName) {
      serializedImports.push(`import { ${exportedName} } from '${filePath}'`)

      if (isDirectFunction) {
        // Direct function: pikkuFunc(fn) - needs to be wrapped
        serializedRegistrations.push(
          `addFunction('${name}', { func: ${exportedName} })`
        )
      } else {
        // Object format: pikkuFunc({ func: fn }) - can be used directly
        serializedRegistrations.push(
          `addFunction('${name}', ${exportedName} as any) // TODO`
        )
      }
    }
    // For renamed functions, we need to import and alias them
    else {
      serializedImports.push(
        `import { ${exportedName} as ${name} } from '${filePath}'`
      )

      if (isDirectFunction) {
        // Direct function: pikkuFunc(fn) - needs to be wrapped
        serializedRegistrations.push(
          `addFunction('${name}', { func: ${name} })`
        )
      } else {
        // Object format: pikkuFunc({ func: fn }) - can be used directly
        serializedRegistrations.push(
          `addFunction('${name}', ${name} as any) // TODO`
        )
      }
    }
  }

  // Add a blank line between imports and registrations
  if (serializedImports.length > 0 && serializedRegistrations.length > 0) {
    serializedImports.push('')
  }

  // Combine the imports and registrations
  return [...serializedImports, ...serializedRegistrations].join('\n')
}

export const pikkuFunctions: PikkuCommand = async (
  logger,
  { functionsMetaFile, functionsFile, packageMappings },
  { functions }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Serializing Pikku functions',
    'Serialized Pikku functions',
    [false],
    async () => {
      await writeFileInDir(
        logger,
        functionsFile,
        serializeFunctionImports(
          functionsFile,
          functions.files,
          functions.meta,
          packageMappings
        )
      )
      await writeFileInDir(
        logger,
        functionsMetaFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('function', 'meta', ${JSON.stringify(functions.meta, null, 2)})`
      )
    }
  )
}
