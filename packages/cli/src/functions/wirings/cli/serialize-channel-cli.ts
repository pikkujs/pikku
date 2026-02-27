import type { CLIProgramMeta } from '@pikku/core/cli'
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
    { pikkuFuncId: string; importPath?: string }
  > = {}

  const collectCommands = (
    commands: Record<string, any>,
    path: string[] = []
  ) => {
    for (const [name, cmd] of Object.entries(commands)) {
      const fullPath = [...path, name]
      const commandKey = fullPath.join('.')

      if (cmd.pikkuFuncId) {
        commandMap[commandKey] = {
          pikkuFuncId: cmd.pikkuFuncId,
        }
      }

      // Recursively process subcommands
      if (cmd.subcommands) {
        collectCommands(cmd.subcommands, fullPath)
      }
    }
  }

  collectCommands(programMeta.commands)

  // Generate imports from function file locations
  const funcNames = [
    ...new Set(Object.values(commandMap).map((v) => v.pikkuFuncId)),
  ]
  const imports = funcNames
    .map((pikkuFuncId) => {
      const fileInfo = functionFiles.get(pikkuFuncId)
      if (!fileInfo) {
        throw new Error(`Function not found in files map: ${pikkuFuncId}`)
      }

      const importPath = getFileImportRelativePath(
        channelFile,
        fileInfo.path,
        packageMappings
      )
      return `import { ${fileInfo.exportedName} } from '${importPath}'`
    })
    .join('\n')

  // Get relative path to channel types file
  const channelTypesPath = getFileImportRelativePath(
    channelFile,
    channelTypesFile,
    packageMappings
  )

  // Get relative path to function types file
  const functionTypesPath = getFileImportRelativePath(
    channelFile,
    functionTypesFile,
    packageMappings
  )

  return `/**
 * WebSocket channel backend for '${programName}' CLI commands
 */
import { wireChannel } from '${channelTypesPath}'
import { pikkuMiddleware } from '${functionTypesPath}'
${imports}

// Middleware to close the channel after CLI command completes
const cliCloseOnComplete = pikkuMiddleware(async (_services, { channel }, next) => {
  const closeChannel = () => {
    setTimeout(async () => {
      try {
        // This gives time for the response to be sent before closing
        await channel?.close()
      } catch (err) {
        // Ignore errors on close
      }
    }, 200)
  }
  
  try {
    const result = await next()
    closeChannel()
    return result
  } catch (error) {
    closeChannel()
    throw error
  }
})

wireChannel({
  name: '${finalChannelName}',
  route: '${finalChannelRoute}',
  auth: false,
  onMessageWiring: {
    command: {
${Object.entries(commandMap)
  .map(
    ([commandKey, { pikkuFuncId }]) =>
      `      '${commandKey}': {
        func: ${pikkuFuncId},
        middleware: [cliCloseOnComplete],
      }`
  )
  .join(',\n')}
    }
  },
  tags: ['cli', '${programName}']
})
`
}
