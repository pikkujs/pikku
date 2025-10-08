import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import {
  writeFileInDir,
  getFileImportRelativePath,
} from '../../../utils/utils.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeMCPTypes } from './serialize-mcp-types.js'

export const pikkuMCPTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, cliConfig }) => {
    const { mcpTypesFile, functionTypesFile, packageMappings } = cliConfig

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
      skipCondition: false,
      skipMessage: '',
    }),
  ],
})
