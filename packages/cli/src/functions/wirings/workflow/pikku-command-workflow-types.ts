import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { serializeWorkflowTypes } from './serialize-workflow-types.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export const pikkuWorkflowTypes: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const { workflowTypesFile, functionTypesFile, packageMappings } = config

    const functionTypesImportPath = getFileImportRelativePath(
      workflowTypesFile,
      functionTypesFile,
      packageMappings
    )

    await writeFileInDir(
      logger,
      workflowTypesFile,
      serializeWorkflowTypes(functionTypesImportPath)
    )
  },
})
