import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeWorkflowRoutes } from './serialize-workflow-routes.js'

export const pikkuWorkflowRoutes = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }) => {
    if (config.workflowRoutesFile) {
      const pathToPikkuTypes = getFileImportRelativePath(
        config.workflowRoutesFile,
        config.typesDeclarationFile,
        config.packageMappings
      )
      await writeFileInDir(
        logger,
        config.workflowRoutesFile,
        serializeWorkflowRoutes(
          pathToPikkuTypes,
          config.scaffold?.workflow === 'auth'
        )
      )
      return true
    }
    return false
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Workflow Routes',
      commandEnd: 'Generated Workflow Routes',
    }),
  ],
})
