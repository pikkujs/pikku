import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeWorkflowWorkers } from './serialize-workflow-workers.js'

export const pikkuWorkflowWorkers = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }) => {
    if (config.workflowWorkersFile) {
      const pathToPikkuTypes = getFileImportRelativePath(
        config.workflowWorkersFile,
        config.typesDeclarationFile,
        config.packageMappings
      )
      await writeFileInDir(
        logger,
        config.workflowWorkersFile,
        serializeWorkflowWorkers(pathToPikkuTypes)
      )
      return true
    }
    return false
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Workflow Workers',
      commandEnd: 'Generated Workflow Workers',
    }),
  ],
})
