import { pikkuSessionlessFunc } from '#pikku/function'
import { getLeafImportPath } from '../../../utils/leaf-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { removeLegacyScaffoldFile } from '../../../utils/remove-legacy-scaffold-file.js'
import { serializeWorkflowRoutes } from './serialize-workflow-routes.js'
import { resolveScaffoldFeature } from '../../../utils/resolve-scaffold-feature.js'

export const pikkuWorkflowRoutes = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }) => {
    if (
      config.scaffold?.workflow &&
      config.workflowRoutesFile &&
      config.workflowRoutesSchemasFile
    ) {
      const leaf = (name: string) =>
        getLeafImportPath(config.workflowRoutesFile, name, config)
      const { schemas, functions } = serializeWorkflowRoutes(
        leaf,
        resolveScaffoldFeature('workflow', config.scaffold?.workflow).auth
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
