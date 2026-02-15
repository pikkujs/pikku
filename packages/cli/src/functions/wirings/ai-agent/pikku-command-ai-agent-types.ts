import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeAIAgentTypes } from './serialize-ai-agent-types.js'

export const pikkuAIAgentTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const { agentTypesFile, functionTypesFile, packageMappings } = config

    const functionTypesImportPath = getFileImportRelativePath(
      agentTypesFile,
      functionTypesFile,
      packageMappings
    )
    const content = serializeAIAgentTypes(functionTypesImportPath)
    await writeFileInDir(logger, agentTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating AI agent types',
      commandEnd: 'Created AI agent types',
    }),
  ],
})
