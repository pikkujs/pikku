import { CLIProgramMeta, CLICommandMeta } from '@pikku/core/cli'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { Config } from '../../../../types/application-types.js'

/**
 * Collect all unique renderer names from CLI metadata (populated by inspector)
 */
export function collectRendererNames(programMeta: CLIProgramMeta): Set<string> {
  const rendererNames = new Set<string>()

  // Add program-level default renderer
  if (programMeta.defaultRenderName) {
    rendererNames.add(programMeta.defaultRenderName)
  }

  // Recursively collect renderer names from commands
  function collectFromCommand(command: CLICommandMeta): void {
    if (command.renderName) {
      rendererNames.add(command.renderName)
    }

    // Recursively process subcommands
    if (command.subcommands) {
      for (const subCommand of Object.values(command.subcommands)) {
        collectFromCommand(subCommand)
      }
    }
  }

  // Process all commands
  for (const command of Object.values(programMeta.commands)) {
    collectFromCommand(command)
  }

  return rendererNames
}

/**
 * Build a renderers map for CLI commands
 */
function buildRenderersMap(programMeta: CLIProgramMeta): string {
  const entries: string[] = []

  // Build map entries for each command that has a renderer
  function addCommandRenderer(command: CLICommandMeta, path: string[]): void {
    const commandId = path.join('.')
    if (command.renderName) {
      entries.push(`    '${commandId}': ${command.renderName}`)
    }

    // Recursively process subcommands
    if (command.subcommands) {
      for (const [subName, subCommand] of Object.entries(command.subcommands)) {
        addCommandRenderer(subCommand, [...path, subName])
      }
    }
  }

  // Process all commands
  for (const [commandName, command] of Object.entries(programMeta.commands)) {
    addCommandRenderer(command, [commandName])
  }

  if (entries.length === 0) {
    return '{}'
  }

  return `{\n${entries.join(',\n')}\n  }`
}

/**
 * Serializes a CLI-over-Channel client bootstrap file
 * Similar to local CLI bootstrap but uses WebSocket connection
 */
export function serializeChannelCLIClient(
  programName: string,
  programMeta: CLIProgramMeta,
  clientFile: string,
  config: Config,
  cliBootstrapPath: string,
  channelRoute?: string,
  renderersMeta?: Record<string, any>
): string {
  const capitalizedName =
    programName.charAt(0).toUpperCase() + programName.slice(1).replace(/-/g, '')
  const finalChannelRoute = channelRoute || `/cli/${programName}`

  // Get relative import path to CLI bootstrap (for metadata)
  const bootstrapImportPath = getFileImportRelativePath(
    clientFile,
    cliBootstrapPath,
    config.packageMappings
  )

  // Collect all unique renderer names from CLI metadata (populated by inspector)
  const rendererNames = collectRendererNames(programMeta)

  // Generate renderer imports from their source files
  let rendererImports = ''
  if (rendererNames.size > 0 && renderersMeta) {
    const importsByFile = new Map<string, string[]>()

    for (const rendererName of rendererNames) {
      const meta = renderersMeta[rendererName]
      if (meta?.exportedName && meta?.filePath) {
        const relativePath = getFileImportRelativePath(
          clientFile,
          meta.filePath,
          config.packageMappings
        )
        if (!importsByFile.has(relativePath)) {
          importsByFile.set(relativePath, [])
        }
        importsByFile.get(relativePath)!.push(meta.exportedName)
      }
    }

    // Generate import statements
    for (const [path, names] of importsByFile) {
      rendererImports += `import { ${names.join(', ')} } from '${path}'\n`
    }
  }

  // Build renderers map
  const renderersMap = buildRenderersMap(programMeta)

  // Determine default renderer
  const defaultRendererCode = programMeta.defaultRenderName
    ? `,\n    defaultRenderer: ${programMeta.defaultRenderName}`
    : ''

  return `
import { executeCLIViaChannel } from '@pikku/core/cli/channel'
import { CorePikkuWebsocket } from '@pikku/websocket'
import '${bootstrapImportPath}'
${rendererImports}
/**
 * ${capitalizedName} CLI Client (via WebSocket Channel)
 * Executes CLI commands over a WebSocket connection
 */
export async function ${capitalizedName}CLIClient(
  url: string,
  args?: string[]
): Promise<void> {
  // Get WebSocket implementation (browser or Node.js)
  let WebSocketImpl: any
  if (typeof WebSocket !== 'undefined') {
    WebSocketImpl = WebSocket
  } else {
    // Node.js environment - dynamically import 'ws'
    try {
      const wsModule = await import('ws')
      WebSocketImpl = wsModule.default
    } catch (e) {
      throw new Error(
        'No WebSocket implementation found. In Node.js environments, you need to:\\n' +
        '1. Install the "ws" package: npm install ws\\n' +
        'Learn more: https://www.npmjs.com/package/ws'
      )
    }
  }

  // Create WebSocket connection
  const ws = new WebSocketImpl(url) as WebSocket
  const pikkuWS = new CorePikkuWebsocket(ws)

  // Register renderers for CLI commands
  const renderers = ${renderersMap}

  await executeCLIViaChannel({
    programName: '${programName}',
    pikkuWS,
    args,
    renderers${defaultRendererCode},
  })
}

// Export as default for easy importing
export default ${capitalizedName}CLIClient

// For direct execution (if this file is run directly)
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const url = process.env.PIKKU_WS_URL || 'ws://localhost:4002${finalChannelRoute}'
  ${capitalizedName}CLIClient(url, process.argv.slice(2)).catch(error => {
    console.error('Fatal channel CLI error:', error)
    // TODO: We get an error code even when it exists cleanly, investigate
    // process.exit(1)
  })
}
`
}
