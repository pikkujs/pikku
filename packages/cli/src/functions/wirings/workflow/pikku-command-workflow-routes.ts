import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { removeLegacyScaffoldFile } from '../../../utils/remove-legacy-scaffold-file.js'
import { serializeWorkflowRoutes } from './serialize-workflow-routes.js'

export const pikkuWorkflowRoutes = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }) => {
    if (
      config.scaffold?.workflow &&
      config.workflowRoutesFile &&
      config.workflowRoutesSchemasFile
    ) {
      const pathToPikkuTypes = getFileImportRelativePath(
        config.workflowRoutesFile,
        config.typesDeclarationFile,
        config.packageMappings
      )
      const { schemas, functions } = serializeWorkflowRoutes(
        pathToPikkuTypes,
        config.scaffold?.workflow === 'auth'
      )
      await writeFileInDir(logger, config.workflowRoutesSchemasFile, schemas)
      await writeFileInDir(logger, config.workflowRoutesFile, functions)
      await removeLegacyScaffoldFile(config.workflowRoutesFile)
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
