import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeMCPJson } from './serialize-mcp-json.js'

export const pikkuMCPJSON: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, cliConfig, getInspectorState }) => {
    const { mcpEndpoints, functions } = await getInspectorState()
    const { mcpJsonFile, schemaDirectory } = cliConfig

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
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating MCP JSON',
      commandEnd: 'Generated MCP JSON',
      skipCondition: async ({ getInspectorState, cliConfig }) => {
        const { mcpEndpoints } = await getInspectorState()
        return mcpEndpoints.files.size === 0 || !cliConfig.mcpJsonFile
      },
      skipMessage: 'none found or mcpJsonFile not set',
    }),
  ],
})
