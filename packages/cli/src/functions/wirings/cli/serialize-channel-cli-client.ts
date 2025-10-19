import { CLIProgramMeta } from '@pikku/core'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { Config } from '../../../../types/application-types.js'

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
  channelRoute?: string
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

  // TODO: Collect renderer imports and create renderers map
  // For now, renderers are not implemented

  return `
import { executeCLIViaChannel } from '@pikku/core/cli/channel'
import { CorePikkuWebsocket } from '@pikku/websocket'
import '${bootstrapImportPath}'

/**
 * ${capitalizedName} CLI Client (via WebSocket Channel)
 * Executes CLI commands over a WebSocket connection
 */
export async function ${capitalizedName}CLIClient(
  url: string,
  args?: string[]
): Promise<void> {
  // Create WebSocket connection
  const pikkuWS = new CorePikkuWebsocket(url)

  // TODO: Import and register renderers when renderer tracking is implemented
  const renderers = {}

  await executeCLIViaChannel({
    programName: '${programName}',
    pikkuWS,
    args,
    renderers,
  })
}

// Export as default for easy importing
export default ${capitalizedName}CLIClient

// For direct execution (if this file is run directly)
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const url = process.env.PIKKU_WS_URL || 'ws://localhost:3000${finalChannelRoute}'
  ${capitalizedName}CLIClient(url).catch(error => {
    console.error('Fatal error:', error.message)
    process.exit(1)
  })
}
`
}
