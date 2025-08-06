import {
  getFileImportRelativePath,
  logCommandInfoAndTime,
  writeFileInDir,
} from '../../utils.js'
import { PikkuCommand } from '../../types.js'

export const serializeFunctionImports = (
  outputPath: string,
  functionsMap: Map<string, { path: string; exportedName: string }>,
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

    // For directly exported functions, we can just import and register them
    if (name === exportedName) {
      serializedImports.push(`import { ${exportedName} } from '${filePath}'`)
      serializedRegistrations.push(
        `addFunction('${name}', { func: ${exportedName} })`
      )
    }
    // For renamed functions, we need to import and alias them
    else {
      serializedImports.push(
        `import { ${exportedName} as ${name} } from '${filePath}'`
      )
      serializedRegistrations.push(`addFunction('${name}', ${name})`)
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
