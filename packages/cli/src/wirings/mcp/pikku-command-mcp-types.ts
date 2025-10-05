import { logCommandInfoAndTime, writeFileInDir } from '../../utils.js'
import { PikkuCommandWithoutState } from '../../types.js'
import { serializeMCPTypes } from './serialize-mcp-types.js'

export const pikkuMCPTypes: PikkuCommandWithoutState = async (
  logger,
  { mcpTypesFile }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating MCP types',
    'Created MCP types',
    [false],
    async () => {
      const content = serializeMCPTypes()
      await writeFileInDir(logger, mcpTypesFile, content)
    }
  )
}
