import {
  logCommandInfoAndTime,
  serializeFileImports,
  writeFileInDir,
} from '../../utils.js'
import { PikkuCommand } from '../../types.js'

export const pikkuMCP: PikkuCommand = async (
  logger,
  { mcpEndpointsFile, mcpEndpointsMetaFile, packageMappings },
  { mcpEndpoints }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Finding MCP endpoints',
    'Found MCP endpoints',
    [mcpEndpoints.files.size === 0],
    async () => {
      await writeFileInDir(
        logger,
        mcpEndpointsFile,
        serializeFileImports(
          'addMCPEndpoint',
          mcpEndpointsFile,
          mcpEndpoints.files,
          packageMappings
        )
      )
      await writeFileInDir(
        logger,
        mcpEndpointsMetaFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('mcp', 'meta', ${JSON.stringify(mcpEndpoints.meta, null, 2)})`
      )
    }
  )
}
