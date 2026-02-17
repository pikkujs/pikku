import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeMCPJson } from '@pikku/inspector'

export const pikkuMCPJSON = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const state = await getInspectorState()
    const { mcpJsonFile } = config

    if (mcpJsonFile) {
      const mcpJson = serializeMCPJson(logger, state)
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
