import { logCommandInfoAndTime, writeFileInDir } from '../../utils.js'
import { serializeMCPJson } from './serialize-mcp-json.js'
import { PikkuCommand } from '../../types.js'

export const pikkuMCPJSON: PikkuCommand = async (
  logger,
  { mcpJsonFile, schemaDirectory },
  { mcpEndpoints, functions }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Generating MCP JSON',
    'Generated MCP JSON',
    [mcpEndpoints.files.size === 0 || !mcpJsonFile],
    async () => {
      // Generate MCP JSON file
      if (mcpJsonFile) {
        const mcpJson = await serializeMCPJson(
          logger,
          schemaDirectory,
          functions.meta,
          functions.typesMap,
          mcpEndpoints.resourcesMeta,
          mcpEndpoints.toolsMeta,
          mcpEndpoints.promptsMeta
        )
        await writeFileInDir(logger, mcpJsonFile, mcpJson, {
          ignoreModifyComment: true,
        })
      }
    }
  )
}
