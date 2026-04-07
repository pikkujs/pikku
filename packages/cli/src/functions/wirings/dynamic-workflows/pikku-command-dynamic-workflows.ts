import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeDynamicWorkflows } from './serialize-dynamic-workflows.js'

export const pikkuDynamicWorkflows = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }) => {
    if (config.scaffold?.dynamicWorkflows) {
      const pathToPikkuTypes = getFileImportRelativePath(
        config.dynamicWorkflowsFile,
        config.typesDeclarationFile,
        config.packageMappings
      )
      await writeFileInDir(
        logger,
        config.dynamicWorkflowsFile,
        serializeDynamicWorkflows(
          pathToPikkuTypes,
          config.scaffold.dynamicWorkflows === 'auth'
        )
      )
      return true
    }
    return false
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Dynamic Workflows wiring',
      commandEnd: 'Generated Dynamic Workflows wiring',
    }),
  ],
})
