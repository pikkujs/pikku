import type { CLIProgramMeta, CLICommandMeta } from '@pikku/core/cli'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import type { Config } from '../../../../types/application-types.js'
import { DIRECT_EXECUTION_GUARD } from './serialize-cli-entrypoint-guard.js'

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
 * Resolve a renderer name (e.g. `cli-render:kanban:list`) to the JS identifier
 * actually imported into the client file. Returns null when the name has no
 * importable binding so callers can skip it rather than emit invalid JS.
 */
function resolveRendererBinding(
  renderName: string,
  renderersMeta?: Record<string, any>
): string | null {
  return renderersMeta?.[renderName]?.exportedName ?? null
}

/**
 * Build a renderers map for CLI commands
 */
function buildRenderersMap(
  programMeta: CLIProgramMeta,
  renderersMeta?: Record<string, any>
): string {
  const entries: string[] = []

  // Build map entries for each command that has an importable renderer
  function addCommandRenderer(command: CLICommandMeta, path: string[]): void {
    const commandId = path.join('.')
    if (command.renderName) {
      const binding = resolveRendererBinding(command.renderName, renderersMeta)
      if (binding) {
        entries.push(`    '${commandId}': ${binding}`)
      }
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
 * Serializes a CLI-over-Channel client bootstrap file.
 *
 * The client deliberately does NOT import the CLI bootstrap: loading the
 * command tree here would bind the client's version to the server's, which is
 * the coupling running commands remotely exists to remove. Renderers are the
 * only local artefact, and they are optional.
 */
export function serializeChannelCLIClient(
  programName: string,
  programMeta: CLIProgramMeta,
  clientFile: string,
  config: Config,
  _cliBootstrapPath: string,
  channelRoute?: string,
  renderersMeta?: Record<string, any>
): string {
  const capitalizedName =
    programName.charAt(0).toUpperCase() + programName.slice(1).replace(/-/g, '')
  const finalChannelRoute = channelRoute || `/cli/${programName}`

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
        const names = importsByFile.get(relativePath)!
        // Distinct renderer names can share an exported binding — import once.
        if (!names.includes(meta.exportedName)) {
          names.push(meta.exportedName)
        }
      }
    }

    // Generate import statements
    for (const [path, names] of importsByFile) {
      rendererImports += `import { ${names.join(', ')} } from '${path}'\n`
    }
  }

  // Build renderers map (keyed by command id → imported renderer binding)
  const renderersMap = buildRenderersMap(programMeta, renderersMeta)

  // Determine default renderer — only when it resolves to an imported binding
  const defaultRendererBinding = programMeta.defaultRenderName
    ? resolveRendererBinding(programMeta.defaultRenderName, renderersMeta)
    : null
  const defaultRendererCode = defaultRendererBinding
    ? `,\n    defaultRenderer: ${defaultRendererBinding}`
    : ''

  return `
import { executeRawCLIViaChannel } from '@pikku/core/cli/channel'
import type { Capabilities } from '@pikku/core/channel'
import { CorePikkuWebsocket } from '@pikku/websocket'
${rendererImports}
/**
 * ${capitalizedName} CLI Client (via WebSocket Channel)
 *
 * Forwards argv to the server untouched — the command tree is never parsed
 * here, so this client stays valid as the server's commands change. Renderers
 * are matched by the command id the server reports; anything it doesn't
 * recognise falls back to JSON.
 *
 * \`capabilities\` are the functions this client agrees to run on the server's
 * behalf (a git sha, a local path). It is an allowlist, not a convenience —
 * nothing outside it is reachable from the server. A bare function is
 * unclassified and so needs approval before every call; write
 * \`{ execute, needsApproval: false }\` for one that may run unattended.
 */
export async function ${capitalizedName}CLIClient(
  ws: WebSocket,
  args?: string[],
  capabilities: Capabilities = {}
): Promise<number> {
  // Create Pikku WebSocket wrapper
  const pikkuWS = new CorePikkuWebsocket(ws)

  // Register renderers for CLI commands
  const renderers = ${renderersMap}

  return executeRawCLIViaChannel({
    pikkuWS,
    args,
    renderers,
    capabilities${defaultRendererCode},
  })
}

// Export as default for easy importing
export default ${capitalizedName}CLIClient

// For direct execution (if this file is run directly)
${DIRECT_EXECUTION_GUARD}

if (isDirectExecution) {
  const url = process.env.PIKKU_WS_URL || 'ws://localhost:4002${finalChannelRoute}'

  // Attach credentials so the channel authenticates like any other pikku client.
  // A machine API key (PIKKU_API_KEY -> x-api-key) takes precedence; otherwise
  // the human session token saved by \`pikku login\` (~/.pikku/session.json ->
  // Authorization: Bearer) is used. This block only runs on a server runtime
  // (direct execution), so reading the session file is safe — a browser could
  // neither reach it nor set custom headers on its WebSocket.
  const headers: Record<string, string> = {}
  if (process.env.PIKKU_API_KEY) {
    headers['x-api-key'] = process.env.PIKKU_API_KEY
  } else {
    try {
      const { homedir } = await import('os')
      const { readFileSync } = await import('fs')
      const { join } = await import('path')
      const store = JSON.parse(
        readFileSync(join(homedir(), '.pikku', 'session.json'), 'utf8')
      ) as {
        current?: string
        sessions?: Record<string, { accessToken?: string }>
      }
      const token = store.current
        ? store.sessions?.[store.current]?.accessToken
        : undefined
      if (token) {
        headers['authorization'] = \`Bearer \${token}\`
      }
    } catch {
      // No saved session — connect unauthenticated (the server may reject).
    }
  }
  const hasAuth = Object.keys(headers).length > 0

  // Node's global WebSocket reads its second argument as subprotocols and drops
  // custom headers on the floor, so credentials there need the 'ws' module.
  // Bun's honours them natively, and reaching for 'ws' under Bun would load its
  // compatibility shim for nothing. Detected once, the way the CLI picks its
  // dev-server runner.
  const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'

  // Only the header-carrying Bun call needs the cast: the DOM lib types the
  // second argument as subprotocols, which is what Node implements.
  type WebSocketWithHeaders = new (
    url: string,
    options: { headers: Record<string, string> }
  ) => WebSocket

  let ws: WebSocket
  if (!isBun && (hasAuth || typeof WebSocket === 'undefined')) {
    const wsModule = await import('ws')
    ws = new wsModule.default(url, { headers }) as unknown as WebSocket
  } else if (hasAuth) {
    ws = new (WebSocket as unknown as WebSocketWithHeaders)(url, { headers })
  } else {
    ws = new WebSocket(url)
  }

  ${capitalizedName}CLIClient(ws, process.argv.slice(2))
    .then((exitCode) => process.exit(exitCode))
    .catch(error => {
      console.error('Fatal channel CLI error:', error)
      process.exit(1)
    })
}
`
}
