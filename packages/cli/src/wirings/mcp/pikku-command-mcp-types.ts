import {
  logCommandInfoAndTime,
  writeFileInDir,
  getFileImportRelativePath,
} from '../../utils.js'
import { PikkuCommandWithoutState } from '../../types.js'
import { serializeMCPTypes } from './serialize-mcp-types.js'

export const pikkuMCPTypes: PikkuCommandWithoutState = async (
  logger,
  { mcpTypesFile, functionTypesFile, packageMappings }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating MCP types',
    'Created MCP types',
    [false],
    async () => {
      const functionTypesImportPath = getFileImportRelativePath(
        mcpTypesFile,
        functionTypesFile,
        packageMappings
      )
      const content = serializeMCPTypes(functionTypesImportPath)
      await writeFileInDir(logger, mcpTypesFile, content)
    }
  )
}
