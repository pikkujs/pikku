import { CLIProgramMeta } from '@pikku/core'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

/**
 * Serializes a wireChannel call from CLI metadata
 * This creates a WebSocket backend for all CLI commands
 */
export function serializeChannelCLI(
  programName: string,
  programMeta: CLIProgramMeta,
  channelFile: string,
  functionFiles: Map<string, { path: string; exportedName: string }>,
  packageMappings: Record<string, string>,
  channelTypesFile: string,
  functionTypesFile: string,
  channelName?: string,
  channelRoute?: string
): string {
  const finalChannelName = channelName || `${programName}-cli`
  const finalChannelRoute = channelRoute || `/cli/${programName}`
  // Flatten all commands into a single routing map
  const commandMap: Record<
    string,
    { pikkuFuncName: string; importPath?: string }
  > = {}

  const collectCommands = (
    commands: Record<string, any>,
    path: string[] = []
  ) => {
    for (const [name, cmd] of Object.entries(commands)) {
      const fullPath = [...path, name]
      const commandKey = fullPath.join('.')

      if (cmd.pikkuFuncName) {
        commandMap[commandKey] = {
          pikkuFuncName: cmd.pikkuFuncName,
        }
      }

      // Recursively process subcommands
      if (cmd.subcommands) {
        collectCommands(cmd.subcommands, fullPath)
      }
    }
  }

  collectCommands(programMeta.commands)

  // Generate the wireChannel call
  const commandEntries = Object.entries(commandMap)
    .map(([commandKey, { pikkuFuncName }]) => {
      return `      '${commandKey}': ${pikkuFuncName}`
    })
    .join(',\n')

  // Generate imports from function file locations
  const funcNames = [
    ...new Set(Object.values(commandMap).map((v) => v.pikkuFuncName)),
  ]
  const imports = funcNames
    .map((pikkuFuncName) => {
      const fileInfo = functionFiles.get(pikkuFuncName)
      if (!fileInfo) {
        throw new Error(`Function not found in files map: ${pikkuFuncName}`)
      }

      const importPath = getFileImportRelativePath(
        channelFile,
        fileInfo.path,
        packageMappings
      )
      return `import { ${fileInfo.exportedName} } from '${importPath}'`
    })
    .join('\n')

  // Get relative paths to type files
  const channelTypesPath = getFileImportRelativePath(
    channelFile,
    channelTypesFile,
    packageMappings
  )
  const functionTypesPath = getFileImportRelativePath(
    channelFile,
    functionTypesFile,
    packageMappings
  )

  return `/**

 * WebSocket channel backend for '${programName}' CLI commands
 */
import { wireChannel } from '${channelTypesPath}'
import { PikkuMiddleware } from '${functionTypesPath}'
${imports}

// Middleware to close channel after command execution
const closeAfterExecution: PikkuMiddleware = async (_services, interaction, next) => {
  try {
    const result = await next()
    return result
  } finally {
    // Close the channel after function completes
    if (interaction.channel) {
      await interaction.channel.close()
    }
  }
}

wireChannel({
  name: '${finalChannelName}',
  route: '${finalChannelRoute}',
  auth: false,
  middleware: [closeAfterExecution],
  onMessageWiring: {
    command: {
${commandEntries}
    }
  },
  tags: ['cli', '${programName}']
})
`
}
