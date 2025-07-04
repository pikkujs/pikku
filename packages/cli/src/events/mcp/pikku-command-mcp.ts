import { PikkuCLIConfig } from '../../pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import { logCommandInfoAndTime, writeFileInDir } from '../../utils.js'
import { serializeMCPJson } from './serialize-mcp-json.js'
import { PikkuCommand } from '../../types.js'

export const pikkuMCP: PikkuCommand = async (
  logger,
  cliConfig: PikkuCLIConfig,
  visitState: InspectorState
) => {
  return await logCommandInfoAndTime(
    logger,
    'Finding MCP endpoints',
    'Found MCP endpoints',
    [visitState.mcpEndpoints.files.size === 0],
    async () => {
      const { mcpJsonFile, schemaDirectory } = cliConfig

      const { mcpEndpoints, functions } = visitState

      // Generate MCP JSON file
      if (mcpJsonFile) {
        const mcpJson = await serializeMCPJson(
          schemaDirectory,
          functions.meta,
          functions.typesMap,
          mcpEndpoints.meta
        )
        await writeFileInDir(logger, mcpJsonFile, mcpJson, {
          ignoreModifyComment: true,
        })
      }
    }
  )
}
