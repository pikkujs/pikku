import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeMCPTypes } from './serialize-mcp-types.js'

export const pikkuMCPTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const { mcpTypesFile, functionTypesFile, packageMappings } = config

    const functionTypesImportPath = getFileImportRelativePath(
      mcpTypesFile,
      functionTypesFile,
      packageMappings
    )
    const content = serializeMCPTypes(functionTypesImportPath)
    await writeFileInDir(logger, mcpTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating MCP types',
      commandEnd: 'Created MCP types',
    }),
  ],
})
