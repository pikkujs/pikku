import type { CLIProgramMeta } from '@pikku/core/cli'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

type WireAddonDeclarations = Map<string, { package: string }>

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
  middlewareTypesFile: string,
  channelName?: string,
  channelRoute?: string,
  globalHTTPPrefix: string = '',
  wireAddonDeclarations?: WireAddonDeclarations
): string {
  const packageToNamespace = new Map<string, string>()
  if (wireAddonDeclarations) {
    for (const [namespace, decl] of wireAddonDeclarations.entries()) {
      packageToNamespace.set(decl.package, namespace)
    }
  }
  const finalChannelName = channelName || `${programName}-cli`
  const finalChannelRoute =
    channelRoute || `${globalHTTPPrefix}/cli/${programName}`
  // Flatten all commands into a single routing map
  const commandMap: Record<
    string,
    { pikkuFuncId: string; isAddon?: boolean; addonNamespace?: string }
  > = {}

  const collectCommands = (
    commands: Record<string, any>,
    path: string[] = []
  ) => {
    for (const [name, cmd] of Object.entries(commands)) {
      const fullPath = [...path, name]
      const commandKey = fullPath.join('.')

      if (cmd.pikkuFuncId) {
        const addonNamespace = cmd.packageName
          ? packageToNamespace.get(cmd.packageName)
          : undefined
        commandMap[commandKey] = {
          pikkuFuncId: cmd.pikkuFuncId,
          isAddon: !!cmd.packageName,
          addonNamespace,
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

  const middlewareTypesPath = getFileImportRelativePath(
    channelFile,
    middlewareTypesFile,
    packageMappings
  )

  return `/**
 * WebSocket channel backend for '${programName}' CLI commands
 */
import { wireChannel } from '${channelTypesPath}'
import { ${hasAddonFuncs ? 'ref, ' : ''}pikkuSessionlessFunc } from '${functionTypesPath}'
import { pikkuMiddleware } from '${middlewareTypesPath}'
import { generateCommandHelp } from '@pikku/core/cli'
import { handleRawCLI, type RawCLIFrame } from '@pikku/core/cli/channel'
import {
  pikkuState,
  getSingletonServices,
  getCreateWireServices,
} from '@pikku/core/state'
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

/**
 * Raw entry point: the client forwards argv untouched and this side owns
 * parsing, so a client binary never carries the command tree and its version
 * is free to drift from the server's.
 *
 * Progressive output is streamed on the same channel rather than returned,
 * and the terminating control frame carries the exit code so the client
 * process can exit non-zero.
 */
export const cliRaw = pikkuSessionlessFunc<{ args: string[] }, RawCLIFrame>({
  auth: false,
  func: async (_services, data: { args: string[] }, { channel, session }) => {
    const { help, result, error, exitCode, commandId } = await handleRawCLI({
      programName: '${programName}',
      args: data.args,
      // The singletons, not this function's own view of them: a function body
      // is handed \`secrets\` as a throwing accessor, and passing that down
      // would strip every command run on this channel of a service its
      // middleware is entitled to. Each command is stripped again by its own
      // runner, so nothing gains access it would not have over HTTP.
      singletonServices: getSingletonServices() as any,
      createWireServices: getCreateWireServices(),
      // The connection authenticated during its upgrade — commands run as it.
      session,
      // The socket the command arrived on, so \`channel.remote(...)\` inside a
      // command reaches the client that invoked it.
      transport: channel,
      onOutput: (output, commandId) =>
        channel?.send({ action: 'cli-output', commandId, data: output }),
    })

    // A failed parse carries both: the error says what was wrong, the help
    // says what was available. The error goes last so it is the line still on
    // screen after the help text has scrolled past.
    if (help !== undefined) {
      await channel?.send({ action: 'cli-help', help })
      if (error !== undefined) {
        await channel?.send({ action: 'cli-error', error })
      }
    } else if (error !== undefined) {
      await channel?.send({ action: 'cli-error', error })
    } else if (result !== undefined) {
      await channel?.send({ action: 'cli-result', commandId, result })
    }

    // Returned rather than sent so the runtime tags it with the routing key,
    // and so the terminal frame cannot be emitted before the ones above it.
    return { action: 'cli-control', event: 'complete', exitCode }
  },
})

${
  programMeta.auth !== false
    ? `/**
 * Refuses a connection that arrives without a session.
 *
 * A CLI authenticates once, when it connects — there is no later message that
 * would establish a session, so a connection that starts anonymous can never
 * run anything. Saying so immediately and hanging up gives the caller a
 * non-zero exit instead of a socket that silently refuses every command.
 */
export const cliRequireSession = pikkuSessionlessFunc<void, RawCLIFrame | void>({
  auth: false,
  func: async (_services, _data, { channel, session }) => {
    if (session) {
      return
    }
    await channel?.send({ action: 'cli-error', error: 'Authentication required' })
    await channel?.send({ action: 'cli-control', event: 'complete', exitCode: 1 })
    await channel?.close()
  },
})
`
    : ''
}
wireChannel({
  name: '${finalChannelName}',
  route: '${finalChannelRoute}',
  auth: ${programMeta.auth !== false},
${programMeta.auth !== false ? '  onConnect: cliRequireSession,\n' : ''}  onMessageWiring: {
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
  .map(([commandKey, { pikkuFuncId, isAddon, addonNamespace }]) => {
    const funcRef = isAddon
      ? `ref('${addonNamespace ? `${addonNamespace}:${pikkuFuncId}` : pikkuFuncId}')`
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
