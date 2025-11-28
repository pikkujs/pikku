import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { serializeWorkflowGraphTypes } from './serialize-workflow-graph-types.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export const pikkuWorkflowGraphTypes: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const { workflowGraphTypesFile, packageMappings } = config

    // Get RPC map import path
    const rpcMapImportPath = getFileImportRelativePath(
      workflowGraphTypesFile,
      config.rpcInternalMapDeclarationFile,
      packageMappings
    )

    await writeFileInDir(
      logger,
      workflowGraphTypesFile,
      serializeWorkflowGraphTypes(rpcMapImportPath)
    )
  },
})
