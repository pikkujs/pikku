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
  channelRoute?: string,
  globalHTTPPrefix: string = ''
): string {
  const finalChannelName = channelName || `${programName}-cli`
  const finalChannelRoute = channelRoute || `${globalHTTPPrefix}/cli/${programName}`
  // Flatten all commands into a single routing map
  const commandMap: Record<string, { pikkuFuncId: string; isAddon?: boolean }> =
    {}

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
          isAddon: !!cmd.packageName,
        }
      }

      // Recursively process subcommands
      if (cmd.subcommands) {
        collectCommands(cmd.subcommands, fullPath)
      }
    }
  }

  collectCommands(programMeta.commands)

  const allFuncs = [
    ...new Set(Object.values(commandMap).map((v) => v.pikkuFuncId)),
  ]
  const localFuncs = allFuncs.filter(
    (id) =>
      !Object.values(commandMap).find((v) => v.pikkuFuncId === id && v.isAddon)
  )
  const hasAddonFuncs = allFuncs.length > localFuncs.length

  const importLines: string[] = []

  for (const pikkuFuncId of localFuncs) {
    const fileInfo = functionFiles.get(pikkuFuncId)
    if (!fileInfo) {
      throw new Error(`Function not found in files map: ${pikkuFuncId}`)
    }
    const importPath = getFileImportRelativePath(
      channelFile,
      fileInfo.path,
      packageMappings
    )
    importLines.push(`import { ${fileInfo.exportedName} } from '${importPath}'`)
  }

  const imports = importLines.join('\n')

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
import { pikkuMiddleware${hasAddonFuncs ? ', addon' : ''}, pikkuSessionlessFunc } from '${functionTypesPath}'
import { generateCommandHelp } from '@pikku/core/cli'
import { handleRawCLI } from '@pikku/core/cli/channel'
import { pikkuState } from '@pikku/core/internal'
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

export const cliHelp = pikkuSessionlessFunc<{ args?: string[] }, { help: string }>({
  auth: false,
  func: async (_services, data: { args?: string[] }) => {
    const cliMeta = pikkuState(null, 'cli', 'meta')
    const commandPath = data?.args?.length ? data.args : []
    const helpText = generateCommandHelp('${programName}', cliMeta as any, commandPath)
    return { help: helpText }
  },
})

export const cliRaw = pikkuSessionlessFunc<{ args: string[] }, { help?: string; result?: unknown; error?: string }>({
  auth: false,
  func: async (services, data: { args: string[] }) => {
    return handleRawCLI({
      programName: '${programName}',
      args: data.args,
      singletonServices: services as any,
    })
  },
})

wireChannel({
  name: '${finalChannelName}',
  route: '${finalChannelRoute}',
  auth: false,
  onMessageWiring: {
    command: {
      '__help': {
        func: cliHelp,
        middleware: [cliCloseOnComplete],
      },
      '__raw': {
        func: cliRaw,
        middleware: [cliCloseOnComplete],
      },
${Object.entries(commandMap)
  .map(([commandKey, { pikkuFuncId, isAddon }]) => {
    const funcRef = isAddon
      ? `addon('${pikkuFuncId}')`
      : (functionFiles.get(pikkuFuncId)?.exportedName ?? pikkuFuncId)
    return `      '${commandKey}': {
        func: ${funcRef},
        middleware: [cliCloseOnComplete],
      }`
  })
  .join(',\n')}
    }
  },
  tags: ['cli', '${programName}']
})
`
}
