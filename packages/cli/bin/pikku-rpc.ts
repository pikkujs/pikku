import { PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import {
  getFileImportRelativePath,
  logCommandInfoAndTime,
  writeFileInDir,
} from '../src/utils/utils.js'

export const serializeRPCImports = (
  outputPath: string,
  functionsMap: Map<string, { path: string; exportedName: string }>,
  packageMappings: Record<string, string> = {}
) => {
  const serializedImports: string[] = [
    `/* Import and register RPCs */`,
    `import { addFunction } from '@pikku/core/functions'`,
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
      serializedRegistrations.push(`addFunction('${name}', ${exportedName})`)
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

export const pikkuRPC = async (
  { rpcFile, rpcMetaFile, packageMappings }: PikkuCLIConfig,
  { rpc }: InspectorState
) => {
  return await logCommandInfoAndTime(
    'Finding RPCs tasks',
    'Found RPCs',
    [rpc.files.size === 0],
    async () => {
      await writeFileInDir(
        rpcFile,
        serializeRPCImports(rpcFile, rpc.files, packageMappings)
      )
      await writeFileInDir(
        rpcMetaFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('rpc', 'meta', ${JSON.stringify(rpc.meta, null, 2)})`
      )
    }
  )
}
