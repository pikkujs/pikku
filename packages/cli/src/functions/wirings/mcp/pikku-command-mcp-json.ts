import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeMCPJson } from './serialize-mcp-json.js'

export const pikkuMCPJSON: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { mcpEndpoints, functions } = await getInspectorState()
    const { mcpJsonFile, schemaDirectory } = config

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
    }),
  ],
})
